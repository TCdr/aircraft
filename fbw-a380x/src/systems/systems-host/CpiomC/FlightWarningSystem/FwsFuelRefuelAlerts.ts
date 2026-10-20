// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380X FUEL (ATA 28) alerts of the refuel, the automatic ground transfer, the APU feed, the overflows and the weight
 * and balance backup: FUEL ABNORM AUTO REFUEL DISTRIBUTION, APU FEED FAULT, APU FEED VLV NOT CLOSED, AUTO GND XFR
 * COMPLETED, AUTO GND XFR FAULT, PREDICTED CG OUT OF T.O RANGE, REFUEL / DEFUEL SYS FAULT, REFUEL DATA / FMS DISAGREE,
 * REFUEL FAULT, TRIM TK OVERFLOW, WEIGHT & BALANCE BKUP FAULT and WING TK OVERFLOW.
 */

import { Subject } from '@microsoft/msfs-sdk';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { SdPages } from '@shared/EcamSystemPages';
import type { EwdAbnormalDict } from './FwsAbnormalSensed';
import { isOutsideTakeoffCgLimits, WeightAndCg } from './FwsFuelCgWeightAlerts';
import { FuelTankProcedureInputs } from './FwsFuelTankAlerts';

/** The FWS flight phases in which each alert is inhibited */
export const FUEL_REFUEL_PHASE_INHIBITION = {
  abnormAutoRefuelDistribution: [3, 4, 5, 6, 7, 8, 9, 10],
  apuFeedFault: [3, 4, 5, 6, 7, 9, 10],
  apuFeedVlvNotClosed: [3, 4, 5, 6, 7, 8, 9, 10, 11],
  autoGndXfrCompleted: [3, 4, 5, 6, 7, 8, 9, 10],
  autoGndXfrFault: [3, 4, 5, 6, 7, 8, 9, 10],
  predictedCgOutOfToRange: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  refuelDefuelSysFault: [3, 4, 5, 6, 7, 8, 9, 10, 11],
  refuelDataFmsDisagree: [3, 4, 5, 6, 7, 8, 9, 10],
  refuelFault: [3, 4, 5, 6, 7, 8, 9, 10],
  trimTkOverflow: [3, 4, 5, 6, 7, 9, 10],
  weightBalanceBkupFault: [3, 4, 5, 6, 7, 9, 10, 11],
  wingTkOverflow: [3, 4, 5, 6, 7, 9, 10],
};

/** The ECAM ids of the alerts (ata28) */
export const FUEL_REFUEL_ALERT_IDS = {
  abnormAutoRefuelDistribution: 281800001,
  apuFeedFault: 281800003,
  apuFeedVlvNotClosed: 281800004,
  autoGndXfrCompleted: 281800005,
  autoGndXfrFault: 281800006,
  predictedCgOutOfToRange: 281800081,
  refuelDefuelSysFault: 281800082,
  refuelDataFmsDisagree: 281800083,
  refuelFault: 281800084,
  trimTkOverflow: 281800093,
  weightBalanceBkupFault: 281800095,
  wingTkOverflow: 281800097,
};

/** STATUS INOP SYS ALL PHASES */
export const FUEL_REFUEL_INOP_SYS = {
  apu: '490300001',
  refuel: '280300080',
  wbbc: '280300081',
  autoGndXfr: '280300068',
};

/** LIMITATIONS ALL PHASES DELAY T.O */
const DELAY_TO_LIMITATION = '280400002';

/**
 * The difference between a tank quantity and its standard distribution above which the distribution is abnormal, kg
 * (900 lb)
 */
const ABNORMAL_DISTRIBUTION_DEVIATION_KG = 408;

/**
 * The refuel ZFW and ZFCG disagree with the FMS ones above these differences. Design choice: half the entry resolution
 * of the FMS FUEL & LOAD page (0.1 t, 0.1 %).
 */
const REFUEL_DATA_ZFW_TOLERANCE_KG = 50;
const REFUEL_DATA_ZFCG_TOLERANCE_PERCENT = 0.05;

/** What the alerts read on one update */
export interface FuelRefuelInputs {
  onGround: boolean;
  enginesRunning: number;
  apuMasterOn: boolean;
  /** CpiomF/FuelApuFeed */
  apuFeedAbnormallyClosed: boolean;
  apuFeedAbnormallyOpen: boolean;
  /** CpiomF/FuelGroundTransfer */
  autoGndXfrPbOn: boolean;
  autoGndXfrCompleted: boolean;
  autoGndXfrFault: boolean;
  /** CpiomF/FuelRefuelFaults */
  refuelRequested: boolean;
  refuelFault: boolean;
  refuelIsolValveFault: readonly [boolean, boolean];
  /** CpiomF/FuelOverflow */
  wingTkOverflow: readonly [boolean, boolean];
  trimTkOverflow: boolean;
  /** Both WBBCs failed: their outputs carry a failure warning (CpiomF/WeightBalanceBackup) */
  wbbcFailed: boolean;
  /** The ZFW and ZFCG entered in the FMS, null when not entered */
  fmsZfwKg: number | null;
  fmsZfcgPercentMac: number | null;
  /** The ZFW and ZFCG of the OIS REFUEL application, 0 when not entered */
  refuelZfwKg: number;
  refuelZfcgPercentMac: number;
  /** The GW and CG that the FQMS predicts at the end of the refuel (systems a380 FQMS) */
  predicted: WeightAndCg;
  /** The largest difference between a tank quantity and the standard distribution, kg, null when not computed */
  distributionDeviationKg: number | null;
  /** All the transfer pump pb-sws are ON */
  allTransferPumpPbsOn: boolean;
}

/** Reads a valid ARINC 429 word value, null when not in normal operation */
function normalValue(raw: number): number | null {
  const word = new Arinc429Word(raw);
  return word.isNormalOperation() ? word.value : null;
}

/**
 * Reads the inputs of the alerts.
 * @param read reads a simvar as a number
 * @param onGround whether the aircraft is on ground
 * @param enginesRunning the number of engines running
 * @param allTransferPumpPbsOn all the transfer pump pb-sws are ON
 */
export function readFuelRefuelInputs(
  read: (name: string) => number,
  onGround: boolean,
  enginesRunning: number,
  allTransferPumpPbsOn: boolean,
): FuelRefuelInputs {
  const fmsValue = (name: string) =>
    normalValue(read(`L:A32NX_FM1_${name}`)) ?? normalValue(read(`L:A32NX_FM2_${name}`));
  return {
    onGround,
    enginesRunning,
    apuMasterOn: read('L:A32NX_OVHD_APU_MASTER_SW_PB_IS_ON') > 0,
    apuFeedAbnormallyClosed: read('L:A380X_FUEL_APU_FEED_ABNORMALLY_CLOSED') > 0,
    apuFeedAbnormallyOpen: read('L:A380X_FUEL_APU_FEED_ABNORMALLY_OPEN') > 0,
    autoGndXfrPbOn: read('L:A380X_OVHD_FUEL_AUTO_GND_XFR_PB_IS_ON') > 0,
    autoGndXfrCompleted: read('L:A380X_FUEL_AUTO_GND_XFR_COMPLETED') > 0,
    autoGndXfrFault: read('L:A380X_FUEL_AUTO_GND_XFR_FAULT') > 0,
    refuelRequested: read('L:A32NX_REFUEL_STARTED_BY_USR') > 0,
    refuelFault: read('L:A380X_FUEL_REFUEL_FAULT') > 0,
    refuelIsolValveFault: [
      read('L:A380X_FUEL_REFUEL_L_ISOL_VALVE_FAULT') > 0,
      read('L:A380X_FUEL_REFUEL_R_ISOL_VALVE_FAULT') > 0,
    ],
    wingTkOverflow: [read('L:A380X_FUEL_L_WING_TK_OVERFLOW') > 0, read('L:A380X_FUEL_R_WING_TK_OVERFLOW') > 0],
    trimTkOverflow: read('L:A380X_FUEL_TRIM_TK_OVERFLOW') > 0,
    wbbcFailed: new Arinc429Word(read('L:A380X_WBBC_GROSS_WEIGHT')).ssm === Arinc429SignStatusMatrix.FailureWarning,
    fmsZfwKg: fmsValue('ZERO_FUEL_WEIGHT'),
    fmsZfcgPercentMac: fmsValue('ZERO_FUEL_WEIGHT_CG'),
    refuelZfwKg: read('L:A32NX_FUEL_REFUEL_ZFW'),
    refuelZfcgPercentMac: read('L:A32NX_FUEL_REFUEL_ZFCG'),
    predicted: {
      grossWeightKg: normalValue(read('L:A32NX_FQMS_PREDICTED_GROSS_WEIGHT')),
      cgPercentMac: normalValue(read('L:A32NX_FQMS_PREDICTED_CENTER_OF_GRAVITY_MAC')),
    },
    distributionDeviationKg: normalValue(read('L:A32NX_FQMS_REFUEL_DISTRIBUTION_DEVIATION')),
    allTransferPumpPbsOn,
  };
}

/**
 * FUEL ABNORM AUTO REFUEL DISTRIBUTION: when a refuel ends, a tank holds more than 900 lb more or less than the standard
 * distribution of the fuel on board. Evaluated once at the end of the refuel: the automatic transfers on ground move
 * fuel afterwards. Design choice: it stays until the automatic ground transfer has completed (it recovers a standard
 * distribution), a new refuel starts or the aircraft is airborne.
 */
export class AbnormalRefuelDistributionMonitor {
  private wasRefuelling = false;

  private abnormal = false;

  public update(
    refuelRequested: boolean,
    distributionDeviationKg: number | null,
    autoGndXfrCompleted: boolean,
    onGround: boolean,
  ): boolean {
    if (refuelRequested || autoGndXfrCompleted || !onGround) {
      this.abnormal = false;
    } else if (this.wasRefuelling) {
      this.abnormal = distributionDeviationKg !== null && distributionDeviationKg > ABNORMAL_DISTRIBUTION_DEVIATION_KG;
    }
    this.wasRefuelling = refuelRequested;
    return this.abnormal;
  }
}

/**
 * FUEL PREDICTED CG OUT OF T.O RANGE: during a refuel, the FQMS predicts that the CG at the end of the refuel will be
 * outside the certified takeoff limits. Design choice: the alert stays after the refuel (its AUTO GND XFR ON line) until
 * the automatic ground transfer has completed, a new refuel is predicted within the limits or the aircraft is airborne.
 */
export class PredictedCgMonitor {
  private outOfRange = false;

  public update(
    refuelRequested: boolean,
    predicted: WeightAndCg,
    autoGndXfrCompleted: boolean,
    onGround: boolean,
  ): boolean {
    if (!onGround) {
      this.outOfRange = false;
    } else if (refuelRequested && predicted.grossWeightKg !== null && predicted.cgPercentMac !== null) {
      this.outOfRange = isOutsideTakeoffCgLimits(predicted);
    } else if (autoGndXfrCompleted) {
      this.outOfRange = false;
    }
    return this.outOfRange;
  }
}

/**
 * FUEL REFUEL DATA / FMS DISAGREE: the crew entered the ZFW and ZFCG in the FMS, then the ZFW or ZFCG of the refuel was
 * changed in the OIS REFUEL application to other values. A new FMS entry (FMS FUEL & LOAD ... CONFIRM) clears it.
 */
export class RefuelDataFmsMonitor {
  private previousRefuel: [number, number] | null = null;

  private previousFms: [number | null, number | null] = [null, null];

  private refuelUpdatedAfterFms = false;

  public update(
    fmsZfwKg: number | null,
    fmsZfcgPercentMac: number | null,
    refuelZfwKg: number,
    refuelZfcgPercentMac: number,
  ): boolean {
    const fmsEntered = fmsZfwKg !== null && fmsZfcgPercentMac !== null;
    const refuelEntered = refuelZfwKg > 0 && refuelZfcgPercentMac > 0;
    const refuelChanged =
      this.previousRefuel !== null &&
      (this.previousRefuel[0] !== refuelZfwKg || this.previousRefuel[1] !== refuelZfcgPercentMac);
    const fmsChanged = this.previousFms[0] !== fmsZfwKg || this.previousFms[1] !== fmsZfcgPercentMac;
    this.previousRefuel = [refuelZfwKg, refuelZfcgPercentMac];
    this.previousFms = [fmsZfwKg, fmsZfcgPercentMac];

    if (!fmsEntered || !refuelEntered || fmsChanged) {
      this.refuelUpdatedAfterFms = false;
    } else if (refuelChanged) {
      this.refuelUpdatedAfterFms = true;
    }
    return (
      this.refuelUpdatedAfterFms &&
      fmsEntered &&
      (Math.abs(refuelZfwKg - fmsZfwKg) > REFUEL_DATA_ZFW_TOLERANCE_KG ||
        Math.abs(refuelZfcgPercentMac - fmsZfcgPercentMac) > REFUEL_DATA_ZFCG_TOLERANCE_PERCENT)
    );
  }
}

/** Which procedure lines to show and which are completed */
export interface RefuelProcedureLines {
  show: boolean[];
  checked: boolean[];
}

/**
 * FUEL AUTO GND XFR FAULT lines. Items: 0 IF TWO OR MORE ENGs RUNNING, 1 INHIBITED BY SECOND ENG START, 2 GW & GWCG
 * CHECK, 3 AUTO GND XFR OFF; 4 IF AUTO GND XFR FAILED, 5 IF NO ZFW OR ZFWCG IN FMS, 6 FMS ZFW OR ZFWCG VALUES INITIALIZE,
 * 7 ALL TKs PMPs ON, 8 ALL CROSSFEEDS OFF, 9-12 OUTR / MID / INR / TRIM TK XFR AUTO, 13 TRIM TK FEED AUTO.
 */
export function autoGndXfrFaultLines(inputs: FuelRefuelInputs, tank: FuelTankProcedureInputs): RefuelProcedureLines {
  const secondEngineStarted = inputs.enginesRunning >= 2;
  const failed = !secondEngineStarted;
  const noFmsData = inputs.fmsZfwKg === null || inputs.fmsZfcgPercentMac === null;
  const allTankPumpsOn =
    tank.feedMainPbOn.every((on) => on) && tank.feedStbyPbOn.every((on) => on) && inputs.allTransferPumpPbsOn;
  return {
    show: [
      secondEngineStarted,
      secondEngineStarted,
      secondEngineStarted,
      secondEngineStarted,
      failed,
      failed && noFmsData,
      failed && noFmsData,
      failed,
      failed,
      failed,
      failed,
      failed,
      failed,
      failed,
    ],
    checked: [
      secondEngineStarted,
      false,
      false,
      !inputs.autoGndXfrPbOn,
      failed,
      noFmsData,
      !noFmsData,
      allTankPumpsOn,
      tank.crossFeedPbOn.every((on) => !on),
      !tank.outerXfrMan,
      !tank.midXfrMan,
      !tank.innerXfrMan,
      !tank.trimXfrFwd,
      tank.trimTankFeedAuto,
    ],
  };
}

/** The manual transfer selections that the WING TK OVERFLOW lines set back to AUTO (or OFF) */
function anyManualTransferSelected(tank: FuelTankProcedureInputs): boolean {
  return tank.outerXfrMan || tank.emerOuterXfrOn || tank.trimXfrFwd || tank.innerXfrMan || tank.midXfrMan;
}

/**
 * FUEL WING TK OVERFLOW lines. Items: 0 DELAY T.O (on ground); 1 IF MAN XFR SELECTED (when the alert triggered), 2 OUTR
 * TK XFR AUTO, 3 EMER OUTR TK XFR OFF, 4 TRIM TK XFR AUTO, 5 INR TK XFR AUTO, 6 MID TK XFR AUTO; 7 IF NO MAN XFR
 * SELECTED, 8 FUEL XFR : MAN ONLY.
 * @param onGround whether the aircraft is on ground
 * @param manualTransferAtTrigger a manual transfer was selected when the alert triggered
 * @param tank the transfer selections now
 */
export function wingTkOverflowLines(
  onGround: boolean,
  manualTransferAtTrigger: boolean,
  tank: FuelTankProcedureInputs,
): RefuelProcedureLines {
  const manual = manualTransferAtTrigger;
  return {
    show: [onGround, manual, manual, manual, manual, manual, manual, !manual, !manual],
    checked: [
      false,
      manual,
      !tank.outerXfrMan,
      !tank.emerOuterXfrOn,
      !tank.trimXfrFwd,
      !tank.innerXfrMan,
      !tank.midXfrMan,
      !manual,
      false,
    ],
  };
}

/** The FUEL alerts of the refuel, the ground transfer, the APU feed, the overflows and the WBBC */
export class FwsFuelRefuelAlerts {
  public readonly abnormAutoRefuelDistribution = Subject.create(false);

  public readonly apuFeedFault = Subject.create(false);

  public readonly apuFeedVlvNotClosed = Subject.create(false);

  public readonly autoGndXfrCompleted = Subject.create(false);

  public readonly autoGndXfrFault = Subject.create(false);

  public readonly predictedCgOutOfToRange = Subject.create(false);

  public readonly refuelDefuelSysFault = Subject.create(false);

  public readonly refuelDataFmsDisagree = Subject.create(false);

  public readonly refuelFault = Subject.create(false);

  public readonly trimTkOverflow = Subject.create(false);

  public readonly weightBalanceBkupFault = Subject.create(false);

  public readonly wingTkOverflow = Subject.create(false);

  /** The inputs of the last update, for the procedure lines */
  public inputs: FuelRefuelInputs | null = null;

  public tankInputs: FuelTankProcedureInputs | null = null;

  /** A manual transfer was selected when FUEL WING TK OVERFLOW triggered */
  public manualTransferAtWingOverflow = false;

  private readonly distributionMonitor = new AbnormalRefuelDistributionMonitor();

  private readonly predictedCgMonitor = new PredictedCgMonitor();

  private readonly refuelDataMonitor = new RefuelDataFmsMonitor();

  /**
   * @param inputs what the alerts read (readFuelRefuelInputs)
   * @param tank the pb-sw selections of the fuel procedures
   */
  public update(inputs: FuelRefuelInputs, tank: FuelTankProcedureInputs): void {
    this.inputs = inputs;
    this.tankInputs = tank;

    this.abnormAutoRefuelDistribution.set(
      this.distributionMonitor.update(
        inputs.refuelRequested,
        inputs.distributionDeviationKg,
        inputs.autoGndXfrCompleted,
        inputs.onGround,
      ),
    );
    this.apuFeedFault.set(inputs.apuFeedAbnormallyClosed);
    this.apuFeedVlvNotClosed.set(inputs.apuFeedAbnormallyOpen);
    this.autoGndXfrCompleted.set(inputs.autoGndXfrCompleted);
    this.autoGndXfrFault.set(inputs.autoGndXfrFault);
    this.predictedCgOutOfToRange.set(
      this.predictedCgMonitor.update(
        inputs.refuelRequested,
        inputs.predicted,
        inputs.autoGndXfrCompleted,
        inputs.onGround,
      ),
    );
    this.refuelDefuelSysFault.set(inputs.refuelIsolValveFault[0] || inputs.refuelIsolValveFault[1]);
    this.refuelDataFmsDisagree.set(
      this.refuelDataMonitor.update(
        inputs.fmsZfwKg,
        inputs.fmsZfcgPercentMac,
        inputs.refuelZfwKg,
        inputs.refuelZfcgPercentMac,
      ),
    );
    this.refuelFault.set(inputs.refuelFault);
    this.trimTkOverflow.set(inputs.trimTkOverflow);
    this.weightBalanceBkupFault.set(inputs.wbbcFailed);

    const wingOverflow = inputs.wingTkOverflow[0] || inputs.wingTkOverflow[1];
    if (wingOverflow && !this.wingTkOverflow.get()) {
      this.manualTransferAtWingOverflow = anyManualTransferSelected(tank);
    }
    this.wingTkOverflow.set(wingOverflow);
  }
}

/**
 * The abnormal sensed entries of the alerts. Master caution and SC, but FUEL REFUEL FAULT and FUEL WEIGHT & BALANCE
 * BKUP FAULT (crew awareness: no master light, no aural).
 * @param alerts the alerts
 */
export function fuelRefuelAlertEntries(alerts: FwsFuelRefuelAlerts): EwdAbnormalDict {
  const ids = FUEL_REFUEL_ALERT_IDS;
  const inhibition = FUEL_REFUEL_PHASE_INHIBITION;
  const onGround = () => alerts.inputs?.onGround ?? true;
  const refuelInProgress = () => alerts.inputs?.refuelRequested ?? false;
  const autoGndXfrPbOn = () => alerts.inputs?.autoGndXfrPbOn ?? false;
  const whenRefuelCompletedLines = {
    whichItemsToShow: () => [true, true],
    whichItemsChecked: () => [!refuelInProgress(), autoGndXfrPbOn()],
  };
  const noLines = { whichItemsToShow: () => [], whichItemsChecked: () => [] };
  // Before the first update: no line
  const none = (count: number) => new Array<boolean>(count).fill(false);
  return {
    [ids.abnormAutoRefuelDistribution]: {
      flightPhaseInhib: inhibition.abnormAutoRefuelDistribution,
      simVarIsActive: alerts.abnormAutoRefuelDistribution,
      notActiveWhenItemActive: [],
      ...whenRefuelCompletedLines,
      failure: 2,
      sysPage: SdPages.Fuel,
    },
    [ids.apuFeedFault]: {
      flightPhaseInhib: inhibition.apuFeedFault,
      simVarIsActive: alerts.apuFeedFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!(alerts.inputs?.apuMasterOn ?? false)],
      inopSysAllPhases: () => [FUEL_REFUEL_INOP_SYS.apu],
      failure: 2,
      sysPage: SdPages.Fuel,
    },
    [ids.apuFeedVlvNotClosed]: {
      flightPhaseInhib: inhibition.apuFeedVlvNotClosed,
      simVarIsActive: alerts.apuFeedVlvNotClosed,
      notActiveWhenItemActive: [],
      ...noLines,
      failure: 2,
      sysPage: SdPages.None,
    },
    [ids.autoGndXfrCompleted]: {
      flightPhaseInhib: inhibition.autoGndXfrCompleted,
      simVarIsActive: alerts.autoGndXfrCompleted,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!autoGndXfrPbOn()],
      failure: 2,
      sysPage: SdPages.Fuel,
    },
    [ids.autoGndXfrFault]: {
      flightPhaseInhib: inhibition.autoGndXfrFault,
      simVarIsActive: alerts.autoGndXfrFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () =>
        alerts.inputs && alerts.tankInputs ? autoGndXfrFaultLines(alerts.inputs, alerts.tankInputs).show : none(14),
      whichItemsChecked: () =>
        alerts.inputs && alerts.tankInputs ? autoGndXfrFaultLines(alerts.inputs, alerts.tankInputs).checked : none(14),
      inopSysAllPhases: () => [FUEL_REFUEL_INOP_SYS.autoGndXfr],
      failure: 2,
      sysPage: SdPages.Fuel,
    },
    [ids.predictedCgOutOfToRange]: {
      flightPhaseInhib: inhibition.predictedCgOutOfToRange,
      simVarIsActive: alerts.predictedCgOutOfToRange,
      notActiveWhenItemActive: [],
      ...whenRefuelCompletedLines,
      failure: 2,
      sysPage: SdPages.None,
    },
    [ids.refuelDefuelSysFault]: {
      flightPhaseInhib: inhibition.refuelDefuelSysFault,
      simVarIsActive: alerts.refuelDefuelSysFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        alerts.inputs?.refuelIsolValveFault[0] ?? false,
        alerts.inputs?.refuelIsolValveFault[1] ?? false,
      ],
      whichItemsChecked: () => [false, false],
      failure: 2,
      sysPage: SdPages.None,
    },
    [ids.refuelDataFmsDisagree]: {
      flightPhaseInhib: inhibition.refuelDataFmsDisagree,
      simVarIsActive: alerts.refuelDataFmsDisagree,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [false, false],
      failure: 2,
      sysPage: SdPages.None,
    },
    [ids.refuelFault]: {
      flightPhaseInhib: inhibition.refuelFault,
      simVarIsActive: alerts.refuelFault,
      notActiveWhenItemActive: [],
      ...noLines,
      inopSysAllPhases: () => [FUEL_REFUEL_INOP_SYS.refuel],
      failure: 1,
      sysPage: SdPages.Fuel,
    },
    [ids.trimTkOverflow]: {
      flightPhaseInhib: inhibition.trimTkOverflow,
      simVarIsActive: alerts.trimTkOverflow,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [alerts.tankInputs?.trimXfrFwd ?? false],
      failure: 2,
      sysPage: SdPages.Fuel,
    },
    [ids.weightBalanceBkupFault]: {
      flightPhaseInhib: inhibition.weightBalanceBkupFault,
      simVarIsActive: alerts.weightBalanceBkupFault,
      notActiveWhenItemActive: [],
      ...noLines,
      inopSysAllPhases: () => [FUEL_REFUEL_INOP_SYS.wbbc],
      failure: 1,
      sysPage: SdPages.None,
    },
    [ids.wingTkOverflow]: {
      flightPhaseInhib: inhibition.wingTkOverflow,
      simVarIsActive: alerts.wingTkOverflow,
      notActiveWhenItemActive: [],
      whichItemsToShow: () =>
        alerts.tankInputs
          ? wingTkOverflowLines(onGround(), alerts.manualTransferAtWingOverflow, alerts.tankInputs).show
          : none(9),
      whichItemsChecked: () =>
        alerts.tankInputs
          ? wingTkOverflowLines(onGround(), alerts.manualTransferAtWingOverflow, alerts.tankInputs).checked
          : none(9),
      limitationsAllPhases: () => (onGround() ? [DELAY_TO_LIMITATION] : []),
      failure: 2,
      sysPage: SdPages.Fuel,
    },
  };
}
