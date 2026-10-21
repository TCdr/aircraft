// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380X SMOKE (ATA 26) alerts of the cabin areas and of the fire extinguishing bottles, fed by the Smoke Detection
 * Function (SDF) of systems.wasm (a380_systems fire_and_smoke_protection.rs):
 * - the lavatories of each deck, the flight crew rests 1 and 2, the aft lower deck cabin crew rest and the IFE control
 *   centers (CWS / RCC): L:A32NX_SMOKE_<zone>_DETECTED and L:A32NX_SMOKE_<zone>_DET_FAULT,
 * - the bottles of the aft lower deck cabin crew rest: L:A32NX_SMOKE_AFT_LWR_CAB_REST_BTL_<n>_FAULT,
 * - the SDF itself: L:A32NX_SMOKE_FACILITIES_DET_FAULT and L:A32NX_SMOKE_SAFETY_TEST_REQUIRED,
 * - the routing of the cargo fire bottles: L:A32NX_CARGOSMOKE_DIVERTER_VALVE_FWD(AFT)_FAULT and
 *   L:A32NX_CARGOSMOKE_BOTTLE_CONTROL_FAULT.
 * A failed SDF (SMOKE DET FAULT) reports no smoke, no DET FAULT, no FACILITIES DET FAULT and no SAFETY TEST REQUIRED:
 * the Rust model clears them. The bottle faults do not depend on the SDF.
 */

import { Subject } from '@microsoft/msfs-sdk';
import { SdPages } from '@shared/EcamSystemPages';
import type { EwdAbnormalItem } from './FwsAbnormalSensed';
import type { Three } from './FwsElecSystemAlerts';

/** Flight phase inhibitions */
export const CABIN_SMOKE_PHASE_INHIBITION = {
  /** The DET FAULT and crew rest BTL FAULT cautions: no audio, no master light, crew awareness */
  detFault: [3, 4, 5, 6, 7, 9, 10, 11],
  /** SMOKE FLT REST SMOKE, AFT LWR CAB REST SMOKE, CWS (RCC) SMOKE: CRC, MASTER WARN */
  smoke: [4, 5, 6, 9, 10],
  /** SMOKE MAIN (UPPER) (LOWER) DECK LAVATORY SMOKE: CRC, MASTER WARN */
  lavatorySmoke: [4, 5, 6, 7, 9, 10],
  /** SMOKE FACILITIES DET FAULT (SC, MASTER CAUT) and SMOKE SAFETY TEST REQUIRED (no audio): on ground only */
  sdfStatus: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  /** SMOKE FWD (AFT) CARGO BOTTLES FAULT, SMOKE FWD+AFT CARGOS BOTTLES FAULT: SC, MASTER CAUT */
  cargoBottles: [4, 5, 6, 7, 9, 10],
};

/** The SDF zones of the L:var names, in the order of the alert keys below */
const LAVATORY_ZONES: Three<string> = ['MAIN_DECK_LAV', 'UPPER_DECK_LAV', 'LOWER_DECK_LAV'];
const FLIGHT_CREW_REST_ZONES = ['FLT_REST_1', 'FLT_REST_2'];
const AFT_LOWER_CABIN_CREW_REST_ZONE = 'AFT_LWR_CAB_REST';
/** The IFE control centers: the main deck 1L CWS, the upper deck 1L CWS, the upper deck 3R RCC */
const IFE_CONTROL_CENTER_ZONES: Three<string> = ['MAIN_1L_CWS', 'UPPER_1L_CWS', 'UPPER_3R_RCC'];

/** The alert keys (EcamAbnormalProcedures, ata26.ts) */
export const CABIN_SMOKE_ALERT_KEYS = {
  facilitiesDetFault: 260800042,
  cargoBottlesFault: [260800043, 260800044],
  fwdAftCargoBottlesFault: 260800051,
  aftLowerRestBottleFault: [260800054, 260800055],
  aftLowerRestDetFault: 260800056,
  aftLowerRestSmoke: 260800057,
  flightRestDetFault: 260800058,
  flightRestSmoke: 260800060,
  lavatoryDetFault: [260800062, 260800063, 260800064] as Three<number>,
  lavatorySmoke: [260800065, 260800066, 260800067] as Three<number>,
  ifeControlCenterDetFault: [260800068, 260800070, 260800079] as Three<number>,
  ifeControlCenterSmoke: [260800080, 260800082, 260800091] as Three<number>,
  safetyTestRequired: 260800092,
};

/** STATUS INOP SYS (EcamInopSys) */
export const CABIN_SMOKE_INOP_SYS = {
  /** FACILITIES SMK DET */
  facilitiesDetFault: '260300039',
  /** FWD (AFT) CARGO BTLs */
  cargoBottles: ['260300040', '260300041'],
  /** AFT LWR REST BTL 1(2) */
  aftLowerRestBottle: ['260300047', '260300048'],
  /** AFT LWR REST SMK DET */
  aftLowerRestDetFault: '260300049',
  /** ALL PRIMARY CAB FANS */
  aftLowerRestSmoke: '210300012',
  /** FLT REST SMK DET */
  flightRestDetFault: '260300050',
  /** MAIN (UPPER) (LOWER) LAV SMK DET */
  lavatoryDetFault: ['260300052', '260300053', '260300054'] as Three<string>,
  /** M1L CWS (U1L CWS) (U3R RCC) SMK DET */
  ifeControlCenterDetFault: ['260300063', '260300057', '260300060'] as Three<string>,
};

/*
 * The procedure lines shown, where the ata26.ts entry has more lines than the aircraft procedure:
 * - FACILITIES DET FAULT and CWS (RCC) DET FAULT: CWS OFF is not in the procedure, CKPT / CABIN COM only.
 * - CWS (RCC) SMOKE: CAB FANS OFF and CWS OFF are not in the procedure, CKPT / CABIN COM only.
 * - FLT REST SMOKE and LOWER DECK LAVATORY SMOKE: CAB FANS OFF is not in the procedure, CKPT / CABIN COM only.
 */
const CKPT_CABIN_COM_AFTER_ONE_LINE = [false, true];
const CKPT_CABIN_COM_AFTER_TWO_LINES = [false, false, true];

/** What the FWS reads for these alerts, as real booleans */
export interface CabinSmokeInputs {
  lavatorySmoke: Three<boolean>;
  lavatoryDetFault: Three<boolean>;
  flightRestSmoke: boolean[];
  flightRestDetFault: boolean[];
  aftLowerRestSmoke: boolean;
  aftLowerRestDetFault: boolean;
  aftLowerRestBottleFault: boolean[];
  ifeControlCenterSmoke: Three<boolean>;
  ifeControlCenterDetFault: Three<boolean>;
  facilitiesDetFault: boolean;
  safetyTestRequired: boolean;
  /** The diverter valve cannot take its FWD (AFT) position */
  diverterValveFault: boolean[];
  /** The system that controls the cargo fire bottles is failed */
  cargoBottleControlFault: boolean;
  /** L:A32NX_OVHD_VENT_CAB_FANS_PB_IS_ON */
  cabFansOn: boolean;
}

/**
 * Reads the inputs with `read` (SimVar.GetSimVarValue(name, Bool) in the sim, which returns the number 1 for true).
 * @param read the simvar reader
 * @returns the inputs
 */
export function readCabinSmokeInputs(read: (name: string) => number): CabinSmokeInputs {
  const isOn = (name: string): boolean => read(name) > 0;
  const smoke = (zone: string) => isOn(`L:A32NX_SMOKE_${zone}_DETECTED`);
  const detFault = (zone: string) => isOn(`L:A32NX_SMOKE_${zone}_DET_FAULT`);
  return {
    lavatorySmoke: LAVATORY_ZONES.map(smoke) as Three<boolean>,
    lavatoryDetFault: LAVATORY_ZONES.map(detFault) as Three<boolean>,
    flightRestSmoke: FLIGHT_CREW_REST_ZONES.map(smoke),
    flightRestDetFault: FLIGHT_CREW_REST_ZONES.map(detFault),
    aftLowerRestSmoke: smoke(AFT_LOWER_CABIN_CREW_REST_ZONE),
    aftLowerRestDetFault: detFault(AFT_LOWER_CABIN_CREW_REST_ZONE),
    aftLowerRestBottleFault: [1, 2].map((n) => isOn(`L:A32NX_SMOKE_AFT_LWR_CAB_REST_BTL_${n}_FAULT`)),
    ifeControlCenterSmoke: IFE_CONTROL_CENTER_ZONES.map(smoke) as Three<boolean>,
    ifeControlCenterDetFault: IFE_CONTROL_CENTER_ZONES.map(detFault) as Three<boolean>,
    facilitiesDetFault: isOn('L:A32NX_SMOKE_FACILITIES_DET_FAULT'),
    safetyTestRequired: isOn('L:A32NX_SMOKE_SAFETY_TEST_REQUIRED'),
    diverterValveFault: ['FWD', 'AFT'].map((position) => isOn(`L:A32NX_CARGOSMOKE_DIVERTER_VALVE_${position}_FAULT`)),
    cargoBottleControlFault: isOn('L:A32NX_CARGOSMOKE_BOTTLE_CONTROL_FAULT'),
    cabFansOn: isOn('L:A32NX_OVHD_VENT_CAB_FANS_PB_IS_ON'),
  };
}

/**
 * The cargo bottles alerts. FWD+AFT CARGOS BOTTLES FAULT: the bottle control system is failed, or the diverter valve
 * can take neither position; it replaces the FWD (AFT) CARGO BOTTLES FAULT of each position.
 * @param diverterValveFault the diverter valve cannot take its FWD (AFT) position
 * @param controlFault the system that controls the bottles is failed
 * @returns the FWD and AFT CARGO BOTTLES FAULT, and the FWD+AFT CARGOS BOTTLES FAULT
 */
export function cargoBottlesFaults(
  diverterValveFault: boolean[],
  controlFault: boolean,
): { fwdAft: boolean; perPosition: boolean[] } {
  const fwdAft = controlFault || (diverterValveFault[0] && diverterValveFault[1]);
  return { fwdAft, perPosition: diverterValveFault.map((fault) => fault && !fwdAft) };
}

/** The state of these alerts in FwsCore, refreshed by update() every FWS cycle */
export class CabinSmokeAlerts {
  public readonly lavatorySmoke = Array.from(Array(3), () => Subject.create(false));

  public readonly lavatoryDetFault = Array.from(Array(3), () => Subject.create(false));

  /** Smoke in flight crew rest compartment 1 or 2 */
  public readonly flightRestSmoke = Subject.create(false);

  public readonly flightRestDetFault = Subject.create(false);

  public readonly aftLowerRestSmoke = Subject.create(false);

  public readonly aftLowerRestDetFault = Subject.create(false);

  public readonly aftLowerRestBottleFault = Array.from(Array(2), () => Subject.create(false));

  public readonly ifeControlCenterSmoke = Array.from(Array(3), () => Subject.create(false));

  public readonly ifeControlCenterDetFault = Array.from(Array(3), () => Subject.create(false));

  public readonly facilitiesDetFault = Subject.create(false);

  public readonly safetyTestRequired = Subject.create(false);

  public readonly cargoBottlesFault = Array.from(Array(2), () => Subject.create(false));

  public readonly fwdAftCargoBottlesFault = Subject.create(false);

  public cabFansOn = true;

  public update(inputs: CabinSmokeInputs): void {
    for (let deck = 0; deck < 3; deck++) {
      this.lavatorySmoke[deck].set(inputs.lavatorySmoke[deck]);
      this.lavatoryDetFault[deck].set(inputs.lavatoryDetFault[deck]);
      this.ifeControlCenterSmoke[deck].set(inputs.ifeControlCenterSmoke[deck]);
      this.ifeControlCenterDetFault[deck].set(inputs.ifeControlCenterDetFault[deck]);
    }
    this.flightRestSmoke.set(inputs.flightRestSmoke.some((smoke) => smoke));
    this.flightRestDetFault.set(inputs.flightRestDetFault.some((fault) => fault));
    this.aftLowerRestSmoke.set(inputs.aftLowerRestSmoke);
    this.aftLowerRestDetFault.set(inputs.aftLowerRestDetFault);
    inputs.aftLowerRestBottleFault.forEach((fault, bottle) => this.aftLowerRestBottleFault[bottle].set(fault));
    this.facilitiesDetFault.set(inputs.facilitiesDetFault);
    this.safetyTestRequired.set(inputs.safetyTestRequired);
    const cargoBottles = cargoBottlesFaults(inputs.diverterValveFault, inputs.cargoBottleControlFault);
    cargoBottles.perPosition.forEach((fault, position) => this.cargoBottlesFault[position].set(fault));
    this.fwdAftCargoBottlesFault.set(cargoBottles.fwdAft);
    this.cabFansOn = inputs.cabFansOn;
  }
}

/**
 * The FwsAbnormalSensed entries of these alerts.
 * @param alerts the alert state (FwsCore.cabinSmokeAlerts)
 * @returns the entries, by alert key
 */
export function cabinSmokeAbnormalItems(alerts: CabinSmokeAlerts): { [key: number]: EwdAbnormalItem } {
  const keys = CABIN_SMOKE_ALERT_KEYS;
  const inopSys = CABIN_SMOKE_INOP_SYS;
  const items: { [key: number]: EwdAbnormalItem } = {};

  const crewAwareness = (
    simVarIsActive: Subject<boolean>,
    inopSysLine: string | undefined,
    flightPhaseInhib = CABIN_SMOKE_PHASE_INHIBITION.detFault,
  ): EwdAbnormalItem => ({
    flightPhaseInhib,
    simVarIsActive,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => [],
    whichItemsChecked: () => [],
    failure: 1,
    sysPage: SdPages.None,
    ...(inopSysLine === undefined ? {} : { inopSysAllPhases: () => [inopSysLine] }),
  });

  const ckptCabinComWarning = (
    simVarIsActive: Subject<boolean>,
    itemsToShow: boolean[],
    flightPhaseInhib = CABIN_SMOKE_PHASE_INHIBITION.smoke,
  ): EwdAbnormalItem => ({
    flightPhaseInhib,
    simVarIsActive,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => itemsToShow,
    whichItemsChecked: () => itemsToShow.map(() => false),
    failure: 3,
    sysPage: SdPages.None,
  });

  keys.lavatoryDetFault.forEach((key, deck) => {
    items[key] = crewAwareness(alerts.lavatoryDetFault[deck], inopSys.lavatoryDetFault[deck]);
  });
  keys.lavatorySmoke.forEach((key, deck) => {
    const lowerDeck = deck === 2;
    items[key] = ckptCabinComWarning(
      alerts.lavatorySmoke[deck],
      lowerDeck ? CKPT_CABIN_COM_AFTER_ONE_LINE : [true],
      CABIN_SMOKE_PHASE_INHIBITION.lavatorySmoke,
    );
  });

  items[keys.flightRestDetFault] = crewAwareness(alerts.flightRestDetFault, inopSys.flightRestDetFault);
  items[keys.flightRestSmoke] = ckptCabinComWarning(alerts.flightRestSmoke, CKPT_CABIN_COM_AFTER_ONE_LINE);

  keys.ifeControlCenterDetFault.forEach((key, center) => {
    items[key] = {
      ...crewAwareness(alerts.ifeControlCenterDetFault[center], inopSys.ifeControlCenterDetFault[center]),
      whichItemsToShow: () => CKPT_CABIN_COM_AFTER_ONE_LINE,
      whichItemsChecked: () => [false, false],
    };
  });
  keys.ifeControlCenterSmoke.forEach((key, center) => {
    items[key] = ckptCabinComWarning(alerts.ifeControlCenterSmoke[center], CKPT_CABIN_COM_AFTER_TWO_LINES);
  });

  keys.aftLowerRestBottleFault.forEach((key, bottle) => {
    items[key] = crewAwareness(alerts.aftLowerRestBottleFault[bottle], inopSys.aftLowerRestBottle[bottle]);
  });
  items[keys.aftLowerRestDetFault] = crewAwareness(alerts.aftLowerRestDetFault, inopSys.aftLowerRestDetFault);
  // CAB FANS OFF, CKPT / CABIN COM ESTABLISH, IF FIRE PERSISTS : LAND ASAP CONSIDER
  items[keys.aftLowerRestSmoke] = {
    flightPhaseInhib: CABIN_SMOKE_PHASE_INHIBITION.smoke,
    simVarIsActive: alerts.aftLowerRestSmoke,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => [true, true, true, true],
    whichItemsChecked: () => [!alerts.cabFansOn, false, false, false],
    failure: 3,
    sysPage: SdPages.Cond,
    inopSysAllPhases: () => [inopSys.aftLowerRestSmoke],
  };

  items[keys.facilitiesDetFault] = {
    flightPhaseInhib: CABIN_SMOKE_PHASE_INHIBITION.sdfStatus,
    simVarIsActive: alerts.facilitiesDetFault,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => CKPT_CABIN_COM_AFTER_ONE_LINE,
    whichItemsChecked: () => [false, false],
    failure: 2,
    sysPage: SdPages.None,
    inopSysAllPhases: () => [inopSys.facilitiesDetFault],
  };
  items[keys.safetyTestRequired] = crewAwareness(
    alerts.safetyTestRequired,
    undefined,
    CABIN_SMOKE_PHASE_INHIBITION.sdfStatus,
  );

  const cargoBottlesCaution = (simVarIsActive: Subject<boolean>, inopSysLines: string[]): EwdAbnormalItem => ({
    ...crewAwareness(simVarIsActive, undefined, CABIN_SMOKE_PHASE_INHIBITION.cargoBottles),
    failure: 2,
    inopSysAllPhases: () => inopSysLines,
  });
  keys.cargoBottlesFault.forEach((key, position) => {
    items[key] = cargoBottlesCaution(alerts.cargoBottlesFault[position], [inopSys.cargoBottles[position]]);
  });
  items[keys.fwdAftCargoBottlesFault] = cargoBottlesCaution(alerts.fwdAftCargoBottlesFault, inopSys.cargoBottles);

  return items;
}
