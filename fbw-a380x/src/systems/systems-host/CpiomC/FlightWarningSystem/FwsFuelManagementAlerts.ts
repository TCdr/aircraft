// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380X FUEL (ATA 28) alerts of the fuel quantity measurement and of the fuel transfers: FQDC 1(2) FAULT, FQI FAULT,
 * FQMS 1(2) FAULT, FQMS 1+2 FAULT, GAUGING FAULT, SYS COMPONENT FAULT, MAN XFR PROCEDURE, WINGS MAN BALANCING
 * PROCEDURE, NORM XFR FAULT, NORM + ALTN XFR FAULT, OUTR TK XFR FAULT, TRIM TK XFR FAULT, TRIM TK GRVTY FWD XFR FAULT
 * and TRIM & APU LINES FAULT.
 *
 * Sources: the fuel quantity measurement of the Rust fuel system (@shared/FuelQuantityMeasurement), the transfer
 * restrictions of the FQMS simulation (CpiomF/FuelTransferFaults, which writes L:A380X_FUEL_XFR_MAN_ONLY), the outer
 * tank gravity transfer of CpiomF/FuelAlternateTransfers, and the transfer valve and line failures, which the FQMS
 * detects from its valve position monitoring.
 */

import { A380Failure } from '@failures';
import { Arinc429Word } from '@flybywiresim/fbw-sdk';
import { Subject } from '@microsoft/msfs-sdk';
import { SdPages } from '@shared/EcamSystemPages';
import {
  FUEL_QUANTITY_TANK_ORDER,
  FEED_TANK_NAMES,
  FUEL_FQI_LOST_TANKS_VAR,
  FUEL_GAUGING_DEGRADED_TANKS_VAR,
  FUEL_QUANTITY_SYSTEM_FAULTS_VAR,
  FuelQuantitySystemFaults,
  fuelQuantitySystemFaults,
  isFqmsMonitoringLost,
  isTankBitSet,
} from '@shared/FuelQuantityMeasurement';
import type { EwdAbnormalItem } from './FwsAbnormalSensed';
import { readCrossFeedPbSelections, readFeedTankPumpFlags } from './FuelPumpValveFlags';
import { TrimTankFeedSelector } from './FwsFuelCgWeightAlerts';
import { WINGS_IMBALANCE_KG } from './FwsFuelFeedBalanceAlerts';

const KG_PER_LB = 0.45359237;

/** The alert keys (EcamAbnormalProcedures, ata28.ts) */
export const FUEL_MANAGEMENT_ALERT_IDS = {
  fqdcFault: [281800043, 281800044],
  fqiFault: 281800045,
  fqmsFault: [281800046, 281800047],
  fqms12Fault: 281800048,
  gaugingFault: 281800049,
  manXfrProcedure: 281800074,
  normAltnXfrFault: 281800077,
  normXfrFault: 281800078,
  outrTkXfrFault: 281800079,
  sysComponentFault: 281800085,
  trimAndApuLinesFault: 281800087,
  trimTkGrvtyFwdXfrFault: 281800088,
  trimTkXfrFault: 281800094,
  wingsManBalancing: 281800099,
} as const;

/** Flight phase inhibitions */
export const FUEL_MANAGEMENT_PHASE_INHIBITION = {
  /** FQDC 1(2) FAULT, FQMS 1(2) FAULT, NORM XFR FAULT */
  takeoffLandingAndRollout: [3, 4, 5, 6, 7, 9, 10, 11],
  /** FQI, GAUGING, OUTR TK XFR, TRIM TK XFR and TRIM TK GRVTY FWD XFR FAULT, WINGS MAN BALANCING */
  takeoffAndLanding: [3, 4, 5, 6, 7, 9, 10],
  /** FQMS 1+2 FAULT */
  fqms12: [4, 5, 6, 7, 9, 10],
  /** MAN XFR PROCEDURE, NORM + ALTN XFR FAULT: cruise only */
  cruiseOnly: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
  /** SYS COMPONENT FAULT: on ground before the takeoff power and 5 min after the last engine shutdown */
  groundOnly: [3, 4, 5, 6, 7, 8, 9, 10, 11],
  /** TRIM & APU LINES FAULT */
  trimAndApuLines: [4, 5, 6, 9, 10],
} as const;

/** Below this in any feed tank the next manual transfer starts (WHEN ANY FEED TK < 13000 KG) */
const MAN_XFR_FEED_TANK_KG = 28_700 * KG_PER_LB;

/** Below this in any feed tank a manual wings balancing transfer starts (WHEN ANY FEED TK < 15000 KG) */
const MAN_BALANCING_FEED_TANK_KG = 15_000;

/** Below this in both feed tanks 1 and 4: EMER OUTR TK XFR ON (FEED TK 1 + 4 < 15000 KG) */
const EMER_OUTR_XFR_FEED_TANK_KG = 33_000 * KG_PER_LB;

/** For a gravity transfer from the trim tank the pitch attitude must stay below 3° */
const GRAVITY_FWD_XFR_MAX_PITCH_DEG = 3;

/**
 * Design choice: a feed tank above 99 % of its capacity is full (WHEN ANY FEED TK FULL), as no level is published
 */
const FEED_TANK_FULL_RATIO = 0.99;

/** The FQMS detects abnormal trim tank transfers above this CG, % MAC (48.5 % with one FQMS failed) */
const TRIM_XFR_ABNORMAL_CG_PERCENT = 49.5;
const TRIM_XFR_ABNORMAL_CG_ONE_FQMS_PERCENT = 48.5;

/** MAN XFR PROCEDURE: a forward trim tank transfer when the WBBC CG exceeds 48 %, or exceeds 43 % for 5 min */
const MAN_XFR_TRIM_FWD_CG_PERCENT = 48;
const MAN_XFR_CERTIFIED_AFT_CG_PERCENT = 43;
const MAN_XFR_CERTIFIED_AFT_CG_TIME_S = 300;

type Pair<T> = [T, T];
type FeedTanks<T> = [T, T, T, T];

/** What the FWS reads for these alerts */
export interface FuelManagementInputs {
  quantitySystemFaults: FuelQuantitySystemFaults;
  /** L:A32NX_FUEL_FQI_LOST_TANKS */
  fqiLostTanksWord: number;
  /** L:A32NX_FUEL_GAUGING_DEGRADED_TANKS */
  gaugingDegradedTanksWord: number;
  /** The FQMS requires manual transfers (CpiomF/FuelTransferFaults) */
  manualTransferRequired: boolean;
  /** The outer tank gravity transfer after an outer tank pump failure (CpiomF/FuelAlternateTransfers) */
  outerGravityTransferInProgress: boolean;
  /** An inlet valve stuck open on the forward (aft) transfer gallery */
  fwdGalleryInletValveOpen: boolean;
  aftGalleryInletValveOpen: boolean;
  trimTankIsolationValveClosed: boolean;
  trimAndApuLineDamaged: boolean;
  /** L (R) OUTR TK PMP failed */
  outerTankPumpFailed: Pair<boolean>;
  outerXfrMan: boolean;
  midXfrMan: boolean;
  innerXfrMan: boolean;
  trimXfrFwd: boolean;
  trimTankFeed: TrimTankFeedSelector;
  emerOuterXfrOn: boolean;
  outerPumpPbOn: Pair<boolean>;
  trimPumpPbOn: Pair<boolean>;
  innerAftPumpPbOn: Pair<boolean>;
  midAftPumpPbOn: Pair<boolean>;
  feedMainPbOn: FeedTanks<boolean>;
  feedStbyPbOn: FeedTanks<boolean>;
  crossFeedPbOn: FeedTanks<boolean>;
  apuMasterOn: boolean;
  /** Feed tanks 1 to 4, kg */
  feedKg: FeedTanks<number>;
  feedTankFull: FeedTanks<boolean>;
  /** L and R tanks, kg */
  innerKg: Pair<number>;
  midKg: Pair<number>;
  outerKg: Pair<number>;
  trimKg: number;
  /** Nose up positive, degrees */
  pitchDeg: number;
  fqmsCgPercent: number | null;
  wbbcCgPercent: number | null;
  onGround: boolean;
  enginesRunning: number;
}

/**
 * Reads the inputs.
 * @param read reads a simvar in a unit (SimVar.GetSimVarValue in the sim)
 * @param failureActive whether a flyPad failure is active (the transfer valve and line failures the FQMS detects)
 * @param onGround the aircraft on ground
 * @param enginesRunning the number of engines running
 * @returns the inputs
 */
export function readFuelManagementInputs(
  read: (name: string, unit: string) => number,
  failureActive: (failure: number) => boolean,
  onGround: boolean,
  enginesRunning: number,
): FuelManagementInputs {
  const readBool = (name: string) => read(name, 'bool');
  const isOn = (name: string) => readBool(name) > 0;
  const circuitOn = (circuit: number) => isOn(`A:CIRCUIT CONNECTION ON:${circuit}`);
  const xfrMan = (tank: string) => !isOn(`L:A380X_OVHD_FUEL_${tank}_XFR_PB_IS_AUTO`);
  const tankKg = (tank: number) => read(`FUELSYSTEM TANK WEIGHT:${tank}`, 'kilogram');
  const tankFull = (tank: number) => {
    const capacity = read(`FUELSYSTEM TANK CAPACITY:${tank}`, 'gallons');
    return capacity > 0 && read(`FUELSYSTEM TANK QUANTITY:${tank}`, 'gallons') >= FEED_TANK_FULL_RATIO * capacity;
  };
  const cg = (name: string) => {
    const word = new Arinc429Word(read(name, 'number'));
    return word.isNormalOperation() ? word.value : null;
  };
  // MSFS tanks (flight_model.cfg Tank.N): outer 1 and 10, feed 2, 5, 6, 9, mid 3 and 8, inner 4 and 7, trim 11
  const feedTanks = [2, 5, 6, 9];
  const feedPumps = readFeedTankPumpFlags(readBool);
  return {
    quantitySystemFaults: fuelQuantitySystemFaults(read(FUEL_QUANTITY_SYSTEM_FAULTS_VAR, 'number')),
    fqiLostTanksWord: read(FUEL_FQI_LOST_TANKS_VAR, 'number'),
    gaugingDegradedTanksWord: read(FUEL_GAUGING_DEGRADED_TANKS_VAR, 'number'),
    manualTransferRequired: isOn('L:A380X_FUEL_XFR_MAN_ONLY'),
    outerGravityTransferInProgress: isOn('L:A380X_FUEL_ALTN_OUTR_TK_GRAVITY_XFR_IN_PROGRESS'),
    fwdGalleryInletValveOpen: failureActive(A380Failure.FuelFeedTank1FwdInletValveOpen),
    aftGalleryInletValveOpen: failureActive(A380Failure.FuelFeedTank1AftInletValveOpen),
    trimTankIsolationValveClosed: failureActive(A380Failure.FuelTrimTankIsolationValveClosed),
    trimAndApuLineDamaged: failureActive(A380Failure.FuelTrimAndApuLineDamaged),
    outerTankPumpFailed: [
      failureActive(A380Failure.FuelLeftOuterTankPump),
      failureActive(A380Failure.FuelRightOuterTankPump),
    ],
    outerXfrMan: xfrMan('OUTRTK'),
    midXfrMan: xfrMan('MIDTK'),
    innerXfrMan: xfrMan('INRTK'),
    trimXfrFwd: xfrMan('TRIMTK'),
    trimTankFeed: trimTankFeedSelector(read('L:A380X_OVHD_FUEL_TRIM_TK_FEED_SELECTOR', 'number')),
    emerOuterXfrOn: isOn('L:A380X_OVHD_FUEL_EMER_OUTR_XFR_PB_IS_ON'),
    // systems.cfg circuits of the transfer pump pb-sws (CpiomF/FuelManualTransfer)
    outerPumpPbOn: [circuitOn(70), circuitOn(75)],
    trimPumpPbOn: [circuitOn(80), circuitOn(81)],
    innerAftPumpPbOn: [circuitOn(74), circuitOn(79)],
    midAftPumpPbOn: [circuitOn(72), circuitOn(77)],
    feedMainPbOn: feedPumps.map((pumps) => pumps.mainPbOn) as FeedTanks<boolean>,
    feedStbyPbOn: feedPumps.map((pumps) => pumps.stbyPbOn) as FeedTanks<boolean>,
    crossFeedPbOn: readCrossFeedPbSelections(readBool) as FeedTanks<boolean>,
    apuMasterOn: isOn('L:A32NX_OVHD_APU_MASTER_SW_PB_IS_ON'),
    feedKg: feedTanks.map(tankKg) as FeedTanks<number>,
    feedTankFull: feedTanks.map(tankFull) as FeedTanks<boolean>,
    innerKg: [tankKg(4), tankKg(7)],
    midKg: [tankKg(3), tankKg(8)],
    outerKg: [tankKg(1), tankKg(10)],
    trimKg: tankKg(11),
    pitchDeg: -read('PLANE PITCH DEGREES', 'degrees'),
    fqmsCgPercent: cg('L:A32NX_FQMS_CENTER_OF_GRAVITY_MAC'),
    wbbcCgPercent: cg('L:A380X_WBBC_CENTER_OF_GRAVITY_MAC'),
    onGround,
    enginesRunning,
  };
}

/** The TRIM TK FEED selector position of its L:var value (an unknown value is AUTO) */
function trimTankFeedSelector(value: number): TrimTankFeedSelector {
  switch (Math.round(value)) {
    case TrimTankFeedSelector.Open:
      return TrimTankFeedSelector.Open;
    case TrimTankFeedSelector.Isol:
      return TrimTankFeedSelector.Isol;
    default:
      return TrimTankFeedSelector.Auto;
  }
}

/** A tank empty enough for the procedures. Design choice: below 1 kg, as the CpiomF empty tank */
function isEmpty(kg: number): boolean {
  return kg < 1;
}

/**
 * One pair of symmetric tanks out of balance: set above the imbalance threshold, kept until the tank that was lighter
 * is no longer lighter (as WingsBalanceMonitor)
 */
class PairImbalance {
  /** 0 left (first), 1 right (second), null balanced */
  public lighter: number | null = null;

  public update(pair: Pair<number>, thresholdKg: number): boolean {
    if (this.lighter === null) {
      if (Math.abs(pair[0] - pair[1]) > thresholdKg) {
        this.lighter = pair[0] < pair[1] ? 0 : 1;
      }
    } else if (pair[this.lighter] >= pair[1 - this.lighter]) {
      this.lighter = null;
    }
    return this.lighter !== null;
  }

  public reset(): void {
    this.lighter = null;
  }
}

/** The state of these alerts in FwsCore, refreshed by update() every FWS cycle */
export class FuelManagementAlerts {
  public readonly fqdcFault = [Subject.create(false), Subject.create(false)];

  public readonly fqiFault = Subject.create(false);

  public readonly fqmsFault = [Subject.create(false), Subject.create(false)];

  public readonly fqms12Fault = Subject.create(false);

  public readonly gaugingFault = Subject.create(false);

  public readonly sysComponentFault = Subject.create(false);

  public readonly manXfrProcedure = Subject.create(false);

  public readonly wingsManBalancing = Subject.create(false);

  public readonly normXfrFault = Subject.create(false);

  public readonly normAltnXfrFault = Subject.create(false);

  public readonly outrTkXfrFault = Subject.create(false);

  public readonly trimTkXfrFault = Subject.create(false);

  public readonly trimTkGrvtyFwdXfrFault = Subject.create(false);

  public readonly trimAndApuLinesFault = Subject.create(false);

  /** The last inputs, for the procedure lines */
  public inputs: FuelManagementInputs | null = null;

  /** The quantity of every feed tank is lost */
  public allFeedTanksLost = false;

  /** The FQI of a tank is lost */
  public anyTankLost = false;

  /** WINGS MAN BALANCING: the pairs out of balance: feed 1 & 4, feed 2 & 3, inner, mid, outer */
  public readonly imbalance = {
    feed14: new PairImbalance(),
    feed23: new PairImbalance(),
    inner: new PairImbalance(),
    mid: new PairImbalance(),
    outer: new PairImbalance(),
  };

  public imbalanced = { feed14: false, feed23: false, inner: false, mid: false, outer: false };

  /** TRIM TK XFR FAULT causes */
  public trimTankFuelTrapped = false;

  public trimTankCgAbnormal = false;

  /** MAN XFR PROCEDURE: the CG requires a forward trim tank transfer */
  public cgRequiresTrimFwdXfr = false;

  private timeAboveCertifiedAftCgS = 0;

  private trimGravityFaultLatched = false;

  private outerTransferFaultLatched = false;

  /**
   * @param i the inputs
   * @param deltaTimeS the time since the last update, seconds
   */
  public update(i: FuelManagementInputs, deltaTimeS: number): void {
    this.inputs = i;
    const faults = i.quantitySystemFaults;
    const bothFqdcFailed = faults.fqdc[0] && faults.fqdc[1];

    this.fqdcFault.forEach((alert, n) => alert.set(faults.fqdc[n] && !bothFqdcFailed));
    this.fqmsFault.forEach((alert, n) => alert.set(faults.fqms[n] && !faults.fqms[1 - n]));
    this.fqms12Fault.set(isFqmsMonitoringLost(faults));
    this.sysComponentFault.set(
      [0, 1].some((n) => faults.alternateGauging[n] && !faults.fqdc[n]) &&
        !(faults.alternateGauging[0] && faults.alternateGauging[1]),
    );

    this.anyTankLost =
      bothFqdcFailed || FUEL_QUANTITY_TANK_ORDER.some((tank) => isTankBitSet(i.fqiLostTanksWord, tank));
    this.allFeedTanksLost = bothFqdcFailed || FEED_TANK_NAMES.every((tank) => isTankBitSet(i.fqiLostTanksWord, tank));
    this.fqiFault.set(this.anyTankLost);
    this.gaugingFault.set(
      FUEL_QUANTITY_TANK_ORDER.some(
        (tank) => isTankBitSet(i.gaugingDegradedTanksWord, tank) && !isTankBitSet(i.fqiLostTanksWord, tank),
      ),
    );

    this.updateManualTransfer(i, deltaTimeS);
    this.updateTransferFaults(i);
  }

  private updateManualTransfer(i: FuelManagementInputs, deltaTimeS: number): void {
    this.manXfrProcedure.set(i.manualTransferRequired);

    if (i.manualTransferRequired) {
      this.imbalanced = {
        feed14: this.imbalance.feed14.update([i.feedKg[0], i.feedKg[3]], WINGS_IMBALANCE_KG.feed),
        feed23: this.imbalance.feed23.update([i.feedKg[1], i.feedKg[2]], WINGS_IMBALANCE_KG.feed),
        inner: this.imbalance.inner.update(i.innerKg, WINGS_IMBALANCE_KG.inner),
        mid: this.imbalance.mid.update(i.midKg, WINGS_IMBALANCE_KG.mid),
        outer: this.imbalance.outer.update(i.outerKg, WINGS_IMBALANCE_KG.outer),
      };
    } else {
      Object.values(this.imbalance).forEach((pair) => pair.reset());
      this.imbalanced = { feed14: false, feed23: false, inner: false, mid: false, outer: false };
    }
    this.wingsManBalancing.set(Object.values(this.imbalanced).some((imbalanced) => imbalanced));

    const cg = i.wbbcCgPercent;
    this.timeAboveCertifiedAftCgS =
      cg !== null && cg > MAN_XFR_CERTIFIED_AFT_CG_PERCENT ? this.timeAboveCertifiedAftCgS + deltaTimeS : 0;
    this.cgRequiresTrimFwdXfr =
      (cg !== null && cg > MAN_XFR_TRIM_FWD_CG_PERCENT) ||
      this.timeAboveCertifiedAftCgS > MAN_XFR_CERTIFIED_AFT_CG_TIME_S;
  }

  private updateTransferFaults(i: FuelManagementInputs): void {
    const oneGalleryLost = i.fwdGalleryInletValveOpen !== i.aftGalleryInletValveOpen;
    this.normAltnXfrFault.set(i.fwdGalleryInletValveOpen && i.aftGalleryInletValveOpen);
    this.normXfrFault.set(
      (i.outerGravityTransferInProgress || oneGalleryLost) &&
        !(i.fwdGalleryInletValveOpen && i.aftGalleryInletValveOpen),
    );

    // OUTR TK XFR FAULT: a manual pumped outer tank transfer selected, but a pump failed or no forward gallery
    const outerTanksHoldFuel = !isEmpty(i.outerKg[0]) || !isEmpty(i.outerKg[1]);
    const pumpedOuterTransferImpossible =
      i.outerTankPumpFailed.some((failed, side) => failed && !isEmpty(i.outerKg[side])) || i.fwdGalleryInletValveOpen;
    const pumpedManualOuterTransfer = i.outerXfrMan && i.outerPumpPbOn[0] && i.outerPumpPbOn[1];
    if (pumpedManualOuterTransfer && pumpedOuterTransferImpossible && outerTanksHoldFuel) {
      this.outerTransferFaultLatched = true;
    } else if (!i.outerXfrMan || !outerTanksHoldFuel) {
      this.outerTransferFaultLatched = false;
    }
    this.outrTkXfrFault.set(this.outerTransferFaultLatched);

    // TRIM TK XFR FAULT
    const trimHoldsFuel = !isEmpty(i.trimKg);
    this.trimTankFuelTrapped = i.trimTankFeed === TrimTankFeedSelector.Isol && trimHoldsFuel;
    const oneFqmsFailed = i.quantitySystemFaults.fqms[0] !== i.quantitySystemFaults.fqms[1];
    const abnormalCg = oneFqmsFailed ? TRIM_XFR_ABNORMAL_CG_ONE_FQMS_PERCENT : TRIM_XFR_ABNORMAL_CG_PERCENT;
    this.trimTankCgAbnormal = i.fqmsCgPercent !== null && i.fqmsCgPercent > abnormalCg;
    this.trimTkXfrFault.set(i.trimTankIsolationValveClosed || this.trimTankFuelTrapped || this.trimTankCgAbnormal);

    // TRIM TK GRVTY FWD XFR FAULT: kept until the gravity transfer can run again with TRIM TK FEED OPEN
    const pitchAllowsGravity = i.pitchDeg < GRAVITY_FWD_XFR_MAX_PITCH_DEG;
    if (i.trimTankFeed === TrimTankFeedSelector.Open && !pitchAllowsGravity && trimHoldsFuel) {
      this.trimGravityFaultLatched = true;
    } else if (
      !trimHoldsFuel ||
      i.trimTankFeed === TrimTankFeedSelector.Isol ||
      (pitchAllowsGravity && i.trimTankFeed === TrimTankFeedSelector.Open)
    ) {
      this.trimGravityFaultLatched = false;
    }
    this.trimTkGrvtyFwdXfrFault.set(this.trimGravityFaultLatched);

    this.trimAndApuLinesFault.set(i.trimAndApuLineDamaged);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Procedure lines (the items of ata28.ts) and STATUS
// ---------------------------------------------------------------------------------------------------------------------

/** INFO, LIMITATIONS and INOP SYS ids (EcamMessages index.ts) */
const INFO = {
  manOnly: '280200020',
  fobFromFu: '280200021',
  gwcgFromWbbc: '280200022',
  gwFromWbbc: '280200023',
  lossOfXfrIndications: '280200024',
  altnGaugingOnly: '280200025',
  useTrimXfrForCg: '280200026',
  innerTanksNotUsable: '280200027',
  midTanksNotUsable: '280200028',
  trimTankNotUsable: '280200029',
  oneTankPairAtATime: '280200030',
  altnXfrInUse: '280200031',
  fuelConsumptionIncreased: '280200003',
  outerTanksByGravityOnly: '280200008',
  trimGravityRate: '280200010',
  trimTank2300KgNotUsable: '280200011',
} as const;

const LIMITATIONS = {
  landAnsa: '2',
  fuelPartlyUnusable: '280400001',
  delayTakeoff: '280400002',
  trimFwdXfrPitch: '280400011',
  innerTanksNotUsable: '280400020',
  midTanksNotUsable: '280400021',
  trimTankNotUsable: '280400022',
} as const;

const INOP_SYS = {
  jettison: '280300001',
  fuelLeakDet: '280300050',
  fqdc: ['280300060', '280300061'],
  fqdc12: '280300062',
  fqms: ['280300063', '280300064'],
  fqms12: '280300065',
  cgManagement: '280300066',
  autoRefuel: '280300067',
  autoGndXfr: '280300068',
  normAltnXfr: '280300069',
  apu: '490300001',
  cat2: '220300027',
  glsAutoland: '220300010',
} as const;

/** FQI FAULT lines: 0-3 the failure case lines, 4-11 the loss of every feed tank quantity */
function fqiFaultItemsToShow(a: FuelManagementAlerts): boolean[] {
  const i = a.inputs;
  const inFlight = i !== null && !i.onGround;
  const manOnly = i !== null && i.manualTransferRequired;
  const allFeed = a.allFeedTanksLost;
  return [manOnly, true, inFlight, inFlight, allFeed, allFeed, allFeed, allFeed, allFeed, allFeed, allFeed, allFeed];
}

function fqiFaultItemsChecked(a: FuelManagementAlerts): boolean[] {
  const i = a.inputs;
  const outerPumpsOff = i !== null && !i.outerPumpPbOn[0] && !i.outerPumpPbOn[1];
  return [false, false, false, false, false, true, false, false, false, false, outerPumpsOff, !!i?.outerXfrMan];
}

/** MAN XFR PROCEDURE lines: the next manual transfer, from the inner tanks to the trim tank */
function manXfrProcedureItemsToShow(a: FuelManagementAlerts): boolean[] {
  const i = a.inputs;
  if (i === null) {
    return new Array(14).fill(false);
  }
  const innerStage = !isEmpty(i.innerKg[0]) || !isEmpty(i.innerKg[1]);
  const midStage = !innerStage && (!isEmpty(i.midKg[0]) || !isEmpty(i.midKg[1]));
  const outerStage = !innerStage && !midStage && (!isEmpty(i.outerKg[0]) || !isEmpty(i.outerKg[1]));
  const trimStage = !innerStage && !midStage && !outerStage;
  const trimFwd = !isEmpty(i.trimKg) && (trimStage || a.cgRequiresTrimFwdXfr);
  const innerEmptySide = (side: number) =>
    innerStage && i.innerXfrMan && isEmpty(i.innerKg[side]) && !isEmpty(i.innerKg[1 - side]);
  return [
    a.wingsManBalancing.get(),
    innerStage && !i.innerXfrMan,
    innerStage && !i.innerXfrMan,
    innerStage && i.innerXfrMan,
    innerStage && i.innerXfrMan,
    innerEmptySide(0),
    innerEmptySide(1),
    midStage && !i.midXfrMan,
    midStage && !i.midXfrMan,
    midStage && i.midXfrMan,
    midStage && i.midXfrMan,
    outerStage,
    outerStage,
    trimFwd,
  ];
}

function manXfrProcedureItemsChecked(a: FuelManagementAlerts): boolean[] {
  const i = a.inputs;
  if (i === null) {
    return new Array(14).fill(false);
  }
  const anyFeedLow = i.feedKg.some((kg) => kg < MAN_XFR_FEED_TANK_KG);
  const anyFeedFull = i.feedTankFull.some((full) => full);
  return [
    false,
    anyFeedLow,
    i.innerXfrMan,
    anyFeedFull,
    !i.innerXfrMan,
    !i.innerAftPumpPbOn[0],
    !i.innerAftPumpPbOn[1],
    anyFeedLow,
    i.midXfrMan,
    anyFeedFull,
    !i.midXfrMan,
    anyFeedLow,
    i.outerXfrMan,
    i.trimXfrFwd,
  ];
}

/** WINGS MAN BALANCING PROCEDURE lines: 0 on ground, then one block per pair out of balance */
function wingsManBalancingItemsToShow(a: FuelManagementAlerts): boolean[] {
  const i = a.inputs;
  const inFlight = i !== null && !i.onGround;
  const block = (show: boolean, lines: number) => new Array(lines).fill(show && inFlight);
  const lighterFeed14 = a.imbalance.feed14.lighter;
  const lighterFeed23 = a.imbalance.feed23.lighter;
  const lighterInner = a.imbalance.inner.lighter;
  const lighterMid = a.imbalance.mid.lighter;
  const feed14 = inFlight && a.imbalanced.feed14;
  const feed23 = inFlight && a.imbalanced.feed23;
  const inner = inFlight && a.imbalanced.inner;
  const mid = inFlight && a.imbalanced.mid;
  return [
    i !== null && i.onGround,
    // FEED TK 1 & 4: lighter feed tank 1 (pair index 0) or 4 (pair index 1)
    ...block(a.imbalanced.feed14, 5),
    feed14 && lighterFeed14 === 0,
    feed14 && lighterFeed14 === 0,
    feed14 && lighterFeed14 === 1,
    feed14 && lighterFeed14 === 1,
    // FEED TK 2 & 3
    ...block(a.imbalanced.feed23, 5),
    feed23 && lighterFeed23 === 0,
    feed23 && lighterFeed23 === 0,
    feed23 && lighterFeed23 === 1,
    feed23 && lighterFeed23 === 1,
    // INR TKs
    ...block(a.imbalanced.inner, 4),
    inner && lighterInner === 0,
    inner && lighterInner === 1,
    inner,
    // MID TKs
    ...block(a.imbalanced.mid, 4),
    mid && lighterMid === 0,
    mid && lighterMid === 1,
    mid,
    // OUTR TKs
    ...block(a.imbalanced.outer, 5),
  ];
}

function wingsManBalancingItemsChecked(a: FuelManagementAlerts): boolean[] {
  const i = a.inputs;
  if (i === null) {
    return new Array(38).fill(false);
  }
  const anyFeedLow = i.feedKg.some((kg) => kg < MAN_BALANCING_FEED_TANK_KG);
  return [
    false,
    // FEED TK 1 & 4
    false,
    false,
    false,
    i.crossFeedPbOn[0],
    i.crossFeedPbOn[3],
    !i.feedStbyPbOn[0],
    !i.feedMainPbOn[0],
    !i.feedStbyPbOn[3],
    !i.feedMainPbOn[3],
    // FEED TK 2 & 3
    false,
    false,
    false,
    i.crossFeedPbOn[1],
    i.crossFeedPbOn[2],
    !i.feedStbyPbOn[1],
    !i.feedMainPbOn[1],
    !i.feedStbyPbOn[2],
    !i.feedMainPbOn[2],
    // INR TKs
    false,
    false,
    false,
    anyFeedLow,
    !i.innerAftPumpPbOn[0],
    !i.innerAftPumpPbOn[1],
    i.innerXfrMan,
    // MID TKs
    false,
    false,
    false,
    anyFeedLow,
    !i.midAftPumpPbOn[0],
    !i.midAftPumpPbOn[1],
    i.midXfrMan,
    // OUTR TKs
    false,
    false,
    false,
    anyFeedLow,
    i.outerXfrMan,
  ];
}

/** NORM XFR FAULT lines: 0-1 the failed valve on ground, 2-5 in flight when the outer tanks go by gravity */
function normXfrFaultItemsToShow(a: FuelManagementAlerts): boolean[] {
  const i = a.inputs;
  if (i === null) {
    return new Array(6).fill(false);
  }
  const outerByGravity =
    !i.onGround &&
    (i.outerGravityTransferInProgress ||
      (i.fwdGalleryInletValveOpen && (!isEmpty(i.outerKg[0]) || !isEmpty(i.outerKg[1]))));
  return [
    i.onGround && i.fwdGalleryInletValveOpen,
    i.onGround && i.aftGalleryInletValveOpen,
    outerByGravity,
    outerByGravity,
    outerByGravity,
    outerByGravity,
  ];
}

function feedTanks1And4BelowEmerXfr(i: FuelManagementInputs | null): boolean {
  return i !== null && i.feedKg[0] < EMER_OUTR_XFR_FEED_TANK_KG && i.feedKg[3] < EMER_OUTR_XFR_FEED_TANK_KG;
}

/** The trim tank isolation valve closed in flight: the trim tank fuel only goes by gravity */
function isTrimTankGravityOnlyInFlight(i: FuelManagementInputs | null): boolean {
  return i !== null && i.trimTankIsolationValveClosed && !i.onGround;
}

/** TRIM TK XFR FAULT lines: 0-6 the isolation valve, 7-9 the trim tank not usable, 10-13 the abnormal CG */
function trimTkXfrFaultItemsToShow(a: FuelManagementAlerts): boolean[] {
  const i = a.inputs;
  if (i === null) {
    return new Array(14).fill(false);
  }
  const valve = i.trimTankIsolationValveClosed;
  const gravity = isTrimTankGravityOnlyInFlight(i);
  const cgInFlight = a.trimTankCgAbnormal && !i.onGround;
  return [
    valve && i.onGround,
    gravity,
    gravity,
    gravity,
    gravity,
    gravity,
    gravity,
    a.trimTankFuelTrapped && !valve,
    a.trimTankFuelTrapped && !valve,
    a.trimTankFuelTrapped && !valve,
    a.trimTankCgAbnormal && i.onGround,
    cgInFlight && i.innerXfrMan,
    cgInFlight && i.midXfrMan,
    cgInFlight,
  ];
}

/**
 * The FwsAbnormalSensed entries of these alerts.
 * @param a the alert state (FwsCore.fuelManagementAlerts)
 * @returns the entries, by alert key
 */
export function fuelManagementAbnormalItems(a: FuelManagementAlerts): { [key: number]: EwdAbnormalItem } {
  const ids = FUEL_MANAGEMENT_ALERT_IDS;
  const phases = FUEL_MANAGEMENT_PHASE_INHIBITION;
  const i = () => a.inputs;
  const onGround = () => i()?.onGround ?? true;
  const items: { [key: number]: EwdAbnormalItem } = {};

  ids.fqdcFault.forEach((key, n) => {
    items[key] = {
      // FQDC 1(2) FAULT: crew awareness, no audio, no master light
      flightPhaseInhib: [...phases.takeoffLandingAndRollout],
      simVarIsActive: a.fqdcFault[n],
      notActiveWhenItemActive: [ids.fqms12Fault.toString()],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Fuel,
      redundLoss: () => [INOP_SYS.fqdc[n]],
    };
  });

  items[ids.fqiFault] = {
    flightPhaseInhib: [...phases.takeoffAndLanding],
    simVarIsActive: a.fqiFault,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => fqiFaultItemsToShow(a),
    whichItemsChecked: () => fqiFaultItemsChecked(a),
    failure: 2,
    sysPage: SdPages.Fuel,
    inopSysAllPhases: () => [
      INOP_SYS.jettison,
      INOP_SYS.fuelLeakDet,
      INOP_SYS.cgManagement,
      ...((i()?.enginesRunning ?? 0) < 2 ? [INOP_SYS.autoRefuel, INOP_SYS.autoGndXfr] : []),
    ],
    limitationsAllPhases: () =>
      a.allFeedTanksLost
        ? [
            LIMITATIONS.landAnsa,
            LIMITATIONS.innerTanksNotUsable,
            LIMITATIONS.midTanksNotUsable,
            LIMITATIONS.trimTankNotUsable,
          ]
        : [],
    limitationsPfd: () => (a.allFeedTanksLost ? [LIMITATIONS.landAnsa] : []),
    info: () => [
      INFO.fobFromFu,
      ...(a.allFeedTanksLost ? [INFO.useTrimXfrForCg] : []),
      ...(onGround() ? [] : [INFO.gwcgFromWbbc, INFO.gwFromWbbc]),
      ...(i()?.manualTransferRequired ? [INFO.manOnly] : []),
    ],
  };

  ids.fqmsFault.forEach((key, n) => {
    items[key] = {
      // FQMS 1(2) FAULT: no audio, no master light
      flightPhaseInhib: [...phases.takeoffLandingAndRollout],
      simVarIsActive: a.fqmsFault[n],
      notActiveWhenItemActive: [ids.fqms12Fault.toString()],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Fuel,
      redundLoss: () => [INOP_SYS.fqms[n]],
    };
  });

  items[ids.fqms12Fault] = {
    flightPhaseInhib: [...phases.fqms12],
    simVarIsActive: a.fqms12Fault,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => {
      const faults = i()?.quantitySystemFaults;
      const alternateGaugingOnly =
        faults !== undefined && faults.fqms[0] && faults.fqms[1] && !faults.alternateGauging.every((f) => f);
      const inFlight = !onGround();
      return [
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        alternateGaugingOnly,
        true,
        i()?.manualTransferRequired ?? false,
        inFlight,
        inFlight,
      ];
    },
    whichItemsChecked: () => new Array(15).fill(false),
    failure: 2,
    sysPage: SdPages.Fuel,
    inopSysAllPhases: () => {
      const faults = i()?.quantitySystemFaults;
      const alternateGaugingLost = faults !== undefined && faults.alternateGauging.every((f) => f);
      return [INOP_SYS.fqms12, INOP_SYS.jettison, ...(alternateGaugingLost ? [INOP_SYS.fqdc12] : [])];
    },
    inopSysApprLdg: () => [INOP_SYS.cat2, INOP_SYS.glsAutoland],
    info: () => [
      INFO.fobFromFu,
      ...(i()?.manualTransferRequired ? [INFO.manOnly] : []),
      INFO.lossOfXfrIndications,
      ...(onGround() ? [] : [INFO.gwcgFromWbbc, INFO.gwFromWbbc]),
    ],
  };

  items[ids.gaugingFault] = {
    // Design choice: the degradation is medium (FUEL LEAK DET lost, on ground AUTO REFUEL and AUTO GND XFR lost)
    flightPhaseInhib: [...phases.takeoffAndLanding],
    simVarIsActive: a.gaugingFault,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => [onGround()],
    whichItemsChecked: () => [false],
    failure: 2,
    sysPage: SdPages.Fuel,
    inopSysAllPhases: () => [INOP_SYS.fuelLeakDet, ...(onGround() ? [INOP_SYS.autoRefuel, INOP_SYS.autoGndXfr] : [])],
  };

  items[ids.sysComponentFault] = {
    // SYS COMPONENT FAULT: maintenance information on ground, no audio, no master light
    flightPhaseInhib: [...phases.groundOnly],
    simVarIsActive: a.sysComponentFault,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => {
      const faults = i()?.quantitySystemFaults;
      return [0, 1].map((n) => faults !== undefined && faults.alternateGauging[n] && !faults.fqdc[n]);
    },
    whichItemsChecked: () => [false, false],
    failure: 1,
    sysPage: SdPages.Fuel,
  };

  items[ids.manXfrProcedure] = {
    flightPhaseInhib: [...phases.cruiseOnly],
    simVarIsActive: a.manXfrProcedure,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => manXfrProcedureItemsToShow(a),
    whichItemsChecked: () => manXfrProcedureItemsChecked(a),
    failure: 2,
    sysPage: SdPages.Fuel,
    inopSysAllPhases: () => [INOP_SYS.jettison],
    info: () => [INFO.manOnly],
  };

  items[ids.wingsManBalancing] = {
    flightPhaseInhib: [...phases.takeoffAndLanding],
    simVarIsActive: a.wingsManBalancing,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => wingsManBalancingItemsToShow(a),
    whichItemsChecked: () => wingsManBalancingItemsChecked(a),
    failure: 2,
    sysPage: SdPages.Fuel,
    limitationsAllPhases: () => (onGround() ? [LIMITATIONS.delayTakeoff] : []),
    info: () => [INFO.fuelConsumptionIncreased, INFO.oneTankPairAtATime],
  };

  items[ids.normXfrFault] = {
    flightPhaseInhib: [...phases.takeoffLandingAndRollout],
    simVarIsActive: a.normXfrFault,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => normXfrFaultItemsToShow(a),
    whichItemsChecked: () => [false, false, feedTanks1And4BelowEmerXfr(i()), !!i()?.emerOuterXfrOn, false, false],
    failure: 2,
    sysPage: SdPages.Fuel,
    inopSysAllPhases: () => [INOP_SYS.jettison, INOP_SYS.cgManagement],
    info: () => (i()?.fwdGalleryInletValveOpen ? [INFO.outerTanksByGravityOnly, INFO.altnXfrInUse] : []),
  };

  items[ids.normAltnXfrFault] = {
    flightPhaseInhib: [...phases.cruiseOnly],
    simVarIsActive: a.normAltnXfrFault,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => {
      const emer = feedTanks1And4BelowEmerXfr(i());
      return [true, true, true, true, true, true, true, true, emer, emer, emer];
    },
    whichItemsChecked: () => [
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      feedTanks1And4BelowEmerXfr(i()),
      !!i()?.emerOuterXfrOn,
      false,
      false,
    ],
    failure: 2,
    sysPage: SdPages.Fuel,
    inopSysAllPhases: () => [INOP_SYS.normAltnXfr, INOP_SYS.jettison],
    info: () => [INFO.useTrimXfrForCg, INFO.innerTanksNotUsable, INFO.midTanksNotUsable, INFO.trimTankNotUsable],
  };

  items[ids.outrTkXfrFault] = {
    flightPhaseInhib: [...phases.takeoffAndLanding],
    simVarIsActive: a.outrTkXfrFault,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => {
      const inputs = i();
      const gravity = inputs !== null && (!inputs.outerPumpPbOn[0] || !inputs.outerPumpPbOn[1]);
      return [true, true, gravity, gravity];
    },
    whichItemsChecked: () => {
      const inputs = i();
      return [inputs !== null && !inputs.outerPumpPbOn[0], inputs !== null && !inputs.outerPumpPbOn[1], false, false];
    },
    failure: 2,
    sysPage: SdPages.Fuel,
  };

  items[ids.trimTkXfrFault] = {
    flightPhaseInhib: [...phases.takeoffAndLanding],
    simVarIsActive: a.trimTkXfrFault,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => trimTkXfrFaultItemsToShow(a),
    whichItemsChecked: () => {
      const inputs = i();
      if (inputs === null) {
        return new Array(14).fill(false);
      }
      const feed = inputs.trimTankFeed;
      return [
        false,
        !inputs.trimPumpPbOn[0],
        !inputs.trimPumpPbOn[1],
        !inputs.trimXfrFwd,
        false,
        feed === TrimTankFeedSelector.Open,
        false,
        !inputs.trimXfrFwd,
        feed === TrimTankFeedSelector.Isol,
        false,
        false,
        !inputs.innerXfrMan,
        !inputs.midXfrMan,
        inputs.trimXfrFwd,
      ];
    },
    failure: 2,
    sysPage: SdPages.Fuel,
    inopSysAllPhases: () => [INOP_SYS.cgManagement],
    limitationsAllPhases: () => [
      ...(a.trimTankFuelTrapped ? [LIMITATIONS.trimTankNotUsable] : []),
      ...(isTrimTankGravityOnlyInFlight(i()) ? [LIMITATIONS.trimFwdXfrPitch, LIMITATIONS.fuelPartlyUnusable] : []),
      ...(a.trimTankCgAbnormal && onGround() ? [LIMITATIONS.delayTakeoff] : []),
    ],
    info: () => (isTrimTankGravityOnlyInFlight(i()) ? [INFO.trimTank2300KgNotUsable, INFO.trimGravityRate] : []),
  };

  items[ids.trimTkGrvtyFwdXfrFault] = {
    flightPhaseInhib: [...phases.takeoffAndLanding],
    simVarIsActive: a.trimTkGrvtyFwdXfrFault,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => {
      const excessPitch = (i()?.pitchDeg ?? 0) >= GRAVITY_FWD_XFR_MAX_PITCH_DEG;
      return [excessPitch, excessPitch, true, !excessPitch];
    },
    whichItemsChecked: () => {
      const feed = i()?.trimTankFeed;
      return [false, feed === TrimTankFeedSelector.Auto, false, feed === TrimTankFeedSelector.Open];
    },
    failure: 2,
    sysPage: SdPages.Fuel,
    limitationsAllPhases: () => [LIMITATIONS.trimFwdXfrPitch],
  };

  items[ids.trimAndApuLinesFault] = {
    flightPhaseInhib: [...phases.trimAndApuLines],
    simVarIsActive: a.trimAndApuLinesFault,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => [true, true, true, true, !isEmpty(i()?.trimKg ?? 0)],
    whichItemsChecked: () => {
      const inputs = i();
      if (inputs === null) {
        return [false, false, false, false, false];
      }
      return [
        inputs.trimTankFeed === TrimTankFeedSelector.Isol,
        !inputs.trimPumpPbOn[0],
        !inputs.trimPumpPbOn[1],
        !inputs.apuMasterOn,
        false,
      ];
    },
    failure: 2,
    sysPage: SdPages.Fuel,
    inopSysAllPhases: () => [INOP_SYS.apu],
    limitationsAllPhases: () => (!isEmpty(i()?.trimKg ?? 0) ? [LIMITATIONS.trimTankNotUsable] : []),
  };

  return items;
}
