// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * FADEC fault alerts of the A380 (A380 FCOM PRO-ABN-ECAM-10-70, a380_fcom.txt), from the flyPad failures of the systems
 * WASM. The level and the flight phase inhibition of each alert are images, read on the FCOM PDF
 * (airbus-a380-fcom_compress.pdf; pink = inhibited):
 *
 * - ENG 1(2)(3)(4) HP FUEL VLV FAULT, l.172172-172236 (systems engine/hp_fuel_valve_failure.rs writes
 *   L:A32NX_ENGINE_n_HP_FUEL_VALVE_FAULT). l.172178: "The high pressure fuel valve is failed either in the close or in the
 *   open position." l.172203-172226: "During engine start : HP FUEL VALVE NOT OPEN. In the case of manual engine start :
 *   ENG MAN START ... OFF. ENG MASTER ... OFF. During engine shutdown : HP FUEL VALVE NOT CLOSED. In the case of manual
 *   engine start : ENG MAN START ... OFF. ENG MASTER ... OFF. The engine will shutdown by closure of the LP fuel valve.
 *   On ground : ENG FIRE P/B ... PUSH. This ensures LP valve closure." PDF page 5789: single chime, MASTER CAUT, ENGINE
 *   SD page; inhibited in the phases 3, 4, 5, 6, 7, 9 and 10.
 * - The crew awareness alerts of the FADEC faults without engine model effect (systems engine/engine_monitoring_fault.rs
 *   writes one L:var per fault and engine), no aural, no MASTER light and no SD page ("Indications:" empty):
 *   - FUEL STRAINER CLOGGED (l.172106-172132), PDF page 5787: phases 3 to 10 inhibited;
 *   - FUEL FILTER MONITORING FAULT (l.172018-172043), PDF page 5784: phases 1 to 10 inhibited;
 *   - OIL CHIP DETECTED (l.172378-172406), PDF page 5795: phases 1 to 10 inhibited;
 *   - MINOR FAULT (l.172307-172334, "It is triggered after flight if only one engine is affected"), PDF page 5793: phases
 *     2 to 10 inhibited;
 *   - OVERTHRUST PROT LOST (l.172639-172666, "It is displayed after flight if only one engine is affected"), PDF page
 *     5803: phases 2 to 10 inhibited;
 *   - SENSOR FAULT (l.172667-172692), PDF page 5804: phases 2 to 10 inhibited;
 *   - CTL VLV FAULT (l.171454-171470, "One control valve of the applicable engine is failed"), PDF page 5768: phases 2
 *     to 10 inhibited. Not shown: the line "COOL VLV / HP TURB VLV / COMP DISCHARGE VLV NOT OPEN" that names the failed
 *     valve ("Depending on the failure case", l.171466-171470): the flyPad failure does not say which valve failed;
 *   - FADEC IDENT FAULT (l.171629-171643, "The FADEC cannot identify the engine configuration", "Crew awareness"), PDF
 *     page 5773: phases 2 to 12 inhibited.
 * - The FADEC fault cautions without engine model effect, single chime, MASTER CAUT and ENGINE SD page, "Crew
 *   awareness" (no line):
 *   - FUEL SYS CONTAMINATION (l.172133-172156, the bypass valve of the fuel filter is open), PDF page 5788: phases 3 to
 *     7, 9 and 10 inhibited;
 *   - OIL SYS CONTAMINATION (l.172517-172552, the oil filter of the return line is clogged and its bypass valve open),
 *     PDF page 5799: phases 3 to 7, 9 and 10 inhibited.
 * - ENG 1(2)(3)(4) CTL SYS FAULT (l.171310-171445), PDF page 5765: single chime, MASTER CAUT, no SD page, phases 5 and 6
 *   inhibited. Triggers: the flyPad control system failure (no engine model effect), and the "Fuel cutback following
 *   overthrust detection" (l.171321) of the FADEC overthrust protection (a380_systems fadec_automatic_shutdown.rs), which
 *   also shuts the engine down on the ground ("The overthrust protection is active and the FADEC automatically shut
 *   downs the engine. Associated with the ECAM alert ENG 1(2)(3)(4) CTL SYS FAULT", DSC-70-90 l.112856-112858).
 * - ENG TYPE DISAGREE (l.175642-175655, "The engine thrust ratings are not similar on all engines", "Crew awareness"),
 *   PDF page 5873: single chime, MASTER CAUT, no SD page, phases 3 to 12 inhibited. One alert for the four engines.
 */

/** L:A32NX_ENGINE_n_HP_FUEL_VALVE_FAULT (systems::engine::hp_fuel_valve_failure::HpFuelValveFault) */
export enum HpFuelValveFault {
  None = 0,
  /** The valve is closed while the FADEC commands it open */
  NotOpen = 1,
  /** The valve is open while the FADEC commands it closed */
  NotClosed = 2,
}

/** ENG n HP FUEL VLV FAULT: FwsAbnormalSensed level 2, single chime and MASTER CAUT (PDF page 5789) */
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
  /** The flight phase inhibition figure of the FCOM PDF (see the file comment) */
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

/** ENG 1(2)(3)(4) CTL SYS FAULT (ata70 701800001-004): single chime and MASTER CAUT (PDF page 5765) */
export const CTL_SYS_FAULT_LEVEL = 2;

export const CTL_SYS_FAULT_PHASE_INHIBITION = [5, 6];

/**
 * Why the FADEC shut the engine down (L:A32NX_ENGINE_n_FADEC_SHUTDOWN, a380_systems fadec_automatic_shutdown.rs
 * FadecShutdownReason): ENG 1(2)(3)(4) FAIL, "In the case of FADEC overheat or overthrust protection activation, the
 * FADEC indicates the reason of the failure" (l.171719-171720).
 */
export enum FadecShutdownReason {
  None = 0,
  /** "In the case of a FADEC OVHT : The FADEC automatically shuts down the engine." (l.171781-171782) */
  FadecOverheat = 1,
  /** "In the case of THRUST CTL LOST : ... the FADEC automatically shuts down the affected engine." (l.171798-171800) */
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
 * ENG n CTL SYS FAULT, l.171316-171321: "A failure preventing the FADEC for satisfactorily controlling the engine has
 * occurred", among them the "Fuel cutback following overthrust detection"; the overthrust protection shutdown on the
 * ground too (DSC-70-90 l.112856-112858).
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
 * l.171384-171394: "In the case of fuel reduction following overthrust protection activation ...: THR LEVER IDLE. In the
 * case of fuel reduction following overthrust protection activation: ENG MASTER OFF. On ground: THR LEVER IDLE, ENG
 * MASTER OFF". Not shown: the in-flight lines of a degraded engine control (NO RAPID THR CHANGES, SLOW RESPONSE, ENG 2(3)
 * REVERSER DO NOT USE, l.171345-171383), the flyPad control system failure has no engine model effect.
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

/** ENG TYPE DISAGREE (ata70 701800161): single chime and MASTER CAUT (PDF page 5873) */
export const ENG_TYPE_DISAGREE_KEY = 701800161;

export const ENG_TYPE_DISAGREE_LEVEL = 2;

export const ENG_TYPE_DISAGREE_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * ENG TYPE DISAGREE, l.175648: "The engine thrust ratings are not similar on all engines". The flyPad failure "thrust
 * rating differs" of any engine (L:A32NX_ENGINE_n_TYPE_DISAGREE).
 * @param typeDisagree the thrust rating of each engine differs, engine 1 first
 */
export function isEngineTypeDisagree(typeDisagree: readonly boolean[]): boolean {
  return typeDisagree.some((disagree) => disagree);
}
