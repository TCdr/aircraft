// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * FADEC fault alerts of the A380, from the flyPad failures of the systems WASM:
 *
 * - ENG 1(2)(3)(4) HP FUEL VLV FAULT (systems engine/hp_fuel_valve_failure.rs writes
 *   L:A32NX_ENGINE_n_HP_FUEL_VALVE_FAULT): the HP fuel valve is stuck closed or open. Not open at an engine start, or
 *   not closed at a shutdown: MAN START OFF (manual start only) and ENG MASTER OFF; when the HP valve stays open the
 *   LP valve shuts the engine down, and on ground the ENG FIRE pb is pushed to make sure the LP valve closes. Single
 *   chime, MASTER CAUT, ENGINE SD page.
 * - The crew awareness alerts of the FADEC faults without engine model effect (systems
 *   engine/engine_monitoring_fault.rs writes one L:var per fault and engine): no aural, no MASTER light, no SD page.
 *   FUEL STRAINER CLOGGED, FUEL FILTER MONITORING FAULT, OIL CHIP DETECTED, MINOR FAULT and OVERTHRUST PROT LOST
 *   (these two after flight when only one engine is affected), SENSOR FAULT, CTL VLV FAULT, FADEC IDENT FAULT (the
 *   FADEC cannot identify the engine configuration). CTL VLV FAULT does not show the line that names the failed
 *   valve (COOL VLV / HP TURB VLV / COMP DISCHARGE VLV NOT OPEN): the flyPad failure does not say which valve failed.
 * - The FADEC fault cautions without engine model effect and without procedure line, single chime, MASTER CAUT and
 *   ENGINE SD page: FUEL SYS CONTAMINATION (the bypass valve of the fuel filter is open) and OIL SYS CONTAMINATION (the
 *   oil filter of the return line is clogged and its bypass valve open).
 * - ENG 1(2)(3)(4) CTL SYS FAULT: single chime, MASTER CAUT, no SD page. Triggers: the flyPad control system failure
 *   (no engine model effect), and the fuel cutback of the FADEC overthrust protection (a380_systems
 *   fadec_automatic_shutdown.rs), which also shuts the engine down on the ground.
 * - ENG TYPE DISAGREE: the engine thrust ratings differ. Single chime, MASTER CAUT, no SD page, one alert for the four
 *   engines.
 *
 * The levels and flight phase inhibitions below are the aircraft values.
 */

/** L:A32NX_ENGINE_n_HP_FUEL_VALVE_FAULT (systems::engine::hp_fuel_valve_failure::HpFuelValveFault) */
export enum HpFuelValveFault {
  None = 0,
  /** The valve is closed while the FADEC commands it open */
  NotOpen = 1,
  /** The valve is open while the FADEC commands it closed */
  NotClosed = 2,
}

/** ENG n HP FUEL VLV FAULT: FwsAbnormalSensed level 2, single chime and MASTER CAUT */
export const HP_FUEL_VLV_FAULT_LEVEL = 2;

export const HP_FUEL_VLV_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];

/** The crew awareness alerts: FwsAbnormalSensed level 1, no single chime and no MASTER CAUT */
export const ENGINE_MONITORING_ALERT_LEVEL = 1;

export interface HpFuelVlvFaultInputs {
  fault: HpFuelValveFault;
  onGround: boolean;
  masterOn: boolean;
  /** The ENG MAN START pb of the engine is ON (manual engine start) */
  manualStartPbOn: boolean;
  /** The ENG FIRE pb of the engine is released (pushed) */
  firePbReleased: boolean;
}

/** ENG n HP FUEL VLV FAULT is active while the FADEC reports an abnormal valve position. */
export function isHpFuelVlvFaultActive(fault: HpFuelValveFault): boolean {
  return fault !== HpFuelValveFault.None;
}

/**
 * The items of ENG n HP FUEL VLV FAULT (ata70 701800053-056): 0 HP FUEL VALVE NOT OPEN, 1 ENG n MAN START OFF, 2 ENG n
 * MASTER OFF, 3 HP FUEL VALVE NOT CLOSED, 4 ENG n MAN START OFF, 5 ENG n MASTER OFF, 6 ENG n FIRE P/B PUSH (on ground).
 */
export function hpFuelVlvFaultItems(inputs: HpFuelVlvFaultInputs): { show: boolean[]; checked: boolean[] } {
  const notOpen = inputs.fault === HpFuelValveFault.NotOpen;
  const notClosed = inputs.fault === HpFuelValveFault.NotClosed;
  return {
    show: [
      notOpen,
      notOpen && inputs.manualStartPbOn,
      notOpen,
      notClosed,
      notClosed && inputs.manualStartPbOn,
      notClosed,
      notClosed && inputs.onGround,
    ],
    checked: [
      false,
      !inputs.manualStartPbOn,
      !inputs.masterOn,
      false,
      !inputs.manualStartPbOn,
      !inputs.masterOn,
      inputs.firePbReleased,
    ],
  };
}

/** A crew awareness alert of a FADEC fault (systems engine/engine_monitoring_fault.rs). */
export interface EngineMonitoringAlertDefinition {
  /** The end of L:A32NX_ENGINE_n_<variable> the systems WASM writes */
  variable: string;
  /** The ata70 key of the alert of engine 1 (engines 2 to 4 follow) */
  engine1Key: number;
  flightPhaseInhibition: number[];
  /**
   * The cautions with single chime and MASTER CAUT: FwsAbnormalSensed level 2 and the ENGINE SD page. Not set: a crew
   * awareness alert (ENGINE_MONITORING_ALERT_LEVEL, no SD page).
   */
  caution?: true;
}

/** The FwsAbnormalSensed level of a FADEC fault alert: 2 for a caution, 1 for a crew awareness alert */
export function engineMonitoringAlertLevel(alert: EngineMonitoringAlertDefinition): number {
  return alert.caution ? 2 : ENGINE_MONITORING_ALERT_LEVEL;
}

/**
 * FUEL STRAINER CLOGGED, FUEL FILTER MONITORING FAULT, OIL CHIP DETECTED, MINOR FAULT, OVTHR PROT LOST, SENSOR FAULT,
 * CTL VLV FAULT, FADEC IDENT FAULT, FUEL SYS CONTAMINATION, OIL SYS CONTAMINATION
 */
export const ENGINE_MONITORING_ALERTS: EngineMonitoringAlertDefinition[] = [
  { variable: 'FUEL_STRAINER_CLOGGED', engine1Key: 701800045, flightPhaseInhibition: [3, 4, 5, 6, 7, 8, 9, 10] },
  {
    variable: 'FUEL_FILTER_MONITORING_FAULT',
    engine1Key: 701800037,
    flightPhaseInhibition: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  },
  { variable: 'OIL_CHIP_DETECTED', engine1Key: 701800077, flightPhaseInhibition: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { variable: 'MINOR_FAULT', engine1Key: 701800069, flightPhaseInhibition: [2, 3, 4, 5, 6, 7, 8, 9, 10] },
  {
    variable: 'OVERTHRUST_PROTECTION_LOST',
    engine1Key: 701800101,
    flightPhaseInhibition: [2, 3, 4, 5, 6, 7, 8, 9, 10],
  },
  { variable: 'SENSOR_FAULT', engine1Key: 701800105, flightPhaseInhibition: [2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { variable: 'CTL_VLV_FAULT', engine1Key: 701800005, flightPhaseInhibition: [2, 3, 4, 5, 6, 7, 8, 9, 10] },
  {
    variable: 'FADEC_IDENT_FAULT',
    engine1Key: 701800017,
    flightPhaseInhibition: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  },
  {
    variable: 'FUEL_SYS_CONTAMINATION',
    engine1Key: 701800049,
    flightPhaseInhibition: [3, 4, 5, 6, 7, 9, 10],
    caution: true,
  },
  {
    variable: 'OIL_SYS_CONTAMINATION',
    engine1Key: 701800089,
    flightPhaseInhibition: [3, 4, 5, 6, 7, 9, 10],
    caution: true,
  },
];

/** ENG 1(2)(3)(4) CTL SYS FAULT (ata70 701800001-004): single chime and MASTER CAUT */
export const CTL_SYS_FAULT_LEVEL = 2;

export const CTL_SYS_FAULT_PHASE_INHIBITION = [5, 6];

/**
 * Why the FADEC shut the engine down (L:A32NX_ENGINE_n_FADEC_SHUTDOWN, a380_systems fadec_automatic_shutdown.rs
 * FadecShutdownReason): ENG 1(2)(3)(4) FAIL gives the reason after a FADEC overheat or an overthrust protection
 * shutdown.
 */
export enum FadecShutdownReason {
  None = 0,
  FadecOverheat = 1,
  /** Thrust control lost: the overthrust protection shut the engine down */
  ThrustControlLost = 2,
}

export interface CtlSysFaultInputs {
  /** The flyPad control system failure (L:A32NX_ENGINE_n_CTL_SYS_FAULT) */
  controlSystemFault: boolean;
  /** The FADEC shutdown reason (L:A32NX_ENGINE_n_FADEC_SHUTDOWN) */
  fadecShutdownReason: FadecShutdownReason;
  /** The fuel cutback of the FADEC overthrust protection in flight (L:A32NX_ENGINE_n_OVERTHRUST_CUTBACK) */
  overthrustCutback: boolean;
}

/**
 * ENG n CTL SYS FAULT: a failure keeps the FADEC from controlling the engine correctly, including the fuel cutback
 * after an overthrust detection; also the overthrust protection shutdown on the ground.
 */
export function isCtlSysFaultActive(inputs: CtlSysFaultInputs): boolean {
  return (
    inputs.controlSystemFault ||
    inputs.overthrustCutback ||
    inputs.fadecShutdownReason === FadecShutdownReason.ThrustControlLost
  );
}

/**
 * The items of ENG n CTL SYS FAULT (ata70 701800001-004): 0 THR LEVER n IDLE, 1 ENG n MASTER OFF.
 * Both lines show after the overthrust protection fuel cutback and on ground. Not shown: the in-flight lines of a
 * degraded engine control (NO RAPID THR CHANGES, SLOW RESPONSE, ENG 2(3) REVERSER DO NOT USE), the flyPad control
 * system failure has no engine model effect.
 */
export function ctlSysFaultItems(
  inputs: CtlSysFaultInputs,
  onGround: boolean,
  thrLeverIdle: boolean,
  masterOn: boolean,
): { show: boolean[]; checked: boolean[] } {
  const shown = onGround || inputs.overthrustCutback;
  return {
    show: [shown, shown],
    checked: [thrLeverIdle, !masterOn],
  };
}

/** ENG TYPE DISAGREE (ata70 701800161): single chime and MASTER CAUT */
export const ENG_TYPE_DISAGREE_KEY = 701800161;

export const ENG_TYPE_DISAGREE_LEVEL = 2;

export const ENG_TYPE_DISAGREE_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * ENG TYPE DISAGREE: the flyPad failure "thrust rating differs" of any engine (L:A32NX_ENGINE_n_TYPE_DISAGREE).
 * @param typeDisagree the thrust rating of each engine differs, engine 1 first
 */
export function isEngineTypeDisagree(typeDisagree: readonly boolean[]): boolean {
  return typeDisagree.some((disagree) => disagree);
}
