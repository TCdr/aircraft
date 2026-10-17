// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * FADEC fault alerts of the A320, from the flyPad failures of the systems WASM:
 *
 * - ENG 1(2) HP FUEL VALVE (systems engine/hp_fuel_valve_failure.rs writes L:A32NX_ENGINE_n_HP_FUEL_VALVE_FAULT): the HP
 *   fuel valve is failed closed or open. Failed closed with the engine below idle: HP FUEL VALVE NOT OPEN, and on the
 *   ground MAN START (IF MAN START PERFORMED) ... OFF, ENG MASTER (AFFECTED) ... OFF. Failed open with the engine below
 *   idle, or failed closed with the engine at or above idle: HP FUEL POS SWT FAULT. Amber, inhibited in the flight
 *   phases 3, 4, 5, 7 and 8.
 * - The crew awareness alerts of the FADEC faults without engine model effect (systems
 *   engine/engine_monitoring_fault.rs writes one L:var per fault and engine), all amber:
 *   - ENG 1(2) FADEC ALTERNATOR (the FADEC electrical auto supply is lost): inhibited in phases 3, 4, 5, 7, 8;
 *   - ENG 1(2) OVSPD PROT FAULT (the overspeed protection is lost): phases 3, 4, 5, 7, 8;
 *   - ENG 1(2) PROBES FAULT (T12, P0 or PT2 data unavailable on both channels): phases 3, 4, 5, 7, 8, and the first
 *     60 s of flight phase 9;
 *   - ENG 1(2) SENSOR FAULT (PS3, T25, T3, N1 or N2 data unavailable on both channels): phases 4, 5, 7, 8; procedure on
 *     ground THR LEVER (AFFECTED) ... IDLE, ENG MASTER (AFFECTED) ... OFF, in flight AVOID RAPID THR CHANGES, and the
 *     STATUS AVOID RAPID THR CHANGES;
 *   - ENG 1(2) ONE TLA FAULT (crew awareness): phases 3, 4, 5, 6, 7, 8;
 *   - ENG 1(2) REV SWITCH FAULT (the reverser permission switch is failed): phases 3, 4, 5, 6, 7, 8.
 */

/** L:A32NX_ENGINE_n_HP_FUEL_VALVE_FAULT (systems::engine::hp_fuel_valve_failure::HpFuelValveFault) */
export enum HpFuelValveFault {
  None = 0,
  /** The valve is closed while the FADEC commands it open */
  NotOpen = 1,
  /** The valve is open while the FADEC commands it closed */
  NotClosed = 2,
}

/** ENG 1(2) HP FUEL VALVE flight phase inhibition */
export const HP_FUEL_VALVE_PHASE_INHIBITION = [3, 4, 5, 7, 8];

export interface HpFuelValveLineInputs {
  fault: HpFuelValveFault;
  /** The engine is at or above idle (FADEC engine state ON) */
  engineAtOrAboveIdle: boolean;
  onGround: boolean;
  /** The ENG MAN START pb of the engine is ON (a manual start was performed) */
  manualStartPbOn: boolean;
}

/** ENG 1(2) HP FUEL VALVE is active while the FADEC reports an abnormal valve position. */
export function isHpFuelValveAlertActive(fault: HpFuelValveFault): boolean {
  return fault !== HpFuelValveFault.None;
}

/**
 * The lines of ENG 1(2) HP FUEL VALVE, by index in its codes (EwdMessages 7707311/7707312): 0 title, 1 HP FUEL VALVE NOT
 * OPEN, 2 -MAN START n OFF, 3 -ENG MASTER n OFF, 4 HP FUEL POS SWT FAULT.
 */
export function hpFuelValveLines(inputs: HpFuelValveLineInputs): number[] {
  if (inputs.fault === HpFuelValveFault.NotOpen && !inputs.engineAtOrAboveIdle) {
    const lines = [0, 1];
    if (inputs.onGround) {
      if (inputs.manualStartPbOn) {
        lines.push(2);
      }
      lines.push(3);
    }
    return lines;
  }
  return [0, 4];
}

/** A crew awareness alert of a FADEC fault (systems engine/engine_monitoring_fault.rs). */
export interface EngineMonitoringAlertDefinition {
  /** The end of L:A32NX_ENGINE_n_<variable> the systems WASM writes */
  variable: string;
  /** The title after "ENG n" */
  title: string;
  /** The flight phase inhibition (see the file comment) */
  flightPhaseInhibition: number[];
}

export const FADEC_ALTERNATOR: EngineMonitoringAlertDefinition = {
  variable: 'FADEC_ALTERNATOR_FAULT',
  title: 'FADEC ALTERNATOR',
  flightPhaseInhibition: [3, 4, 5, 7, 8],
};

export const OVSPD_PROT_FAULT: EngineMonitoringAlertDefinition = {
  variable: 'OVERSPEED_PROTECTION_FAULT',
  title: 'OVSPD PROT FAULT',
  flightPhaseInhibition: [3, 4, 5, 7, 8],
};

/** The first 60 s of the flight phase 9 are inhibited too, see probesFaultInhibitedInPhase9 */
export const PROBES_FAULT: EngineMonitoringAlertDefinition = {
  variable: 'PROBES_FAULT',
  title: 'PROBES FAULT',
  flightPhaseInhibition: [3, 4, 5, 7, 8],
};

export const SENSOR_FAULT: EngineMonitoringAlertDefinition = {
  variable: 'SENSOR_FAULT',
  title: 'SENSOR FAULT',
  flightPhaseInhibition: [4, 5, 7, 8],
};

export const ONE_TLA_FAULT: EngineMonitoringAlertDefinition = {
  variable: 'ONE_TLA_FAULT',
  title: 'ONE TLA FAULT',
  flightPhaseInhibition: [3, 4, 5, 6, 7, 8],
};

export const REV_SWITCH_FAULT: EngineMonitoringAlertDefinition = {
  variable: 'REVERSER_SWITCH_FAULT',
  title: 'REV SWITCH FAULT',
  flightPhaseInhibition: [3, 4, 5, 6, 7, 8],
};

/** ENG 1(2) PROBES FAULT is inhibited during the first 60 s of the flight phase 9 */
const PROBES_FAULT_PHASE_9_INHIBITION_SECONDS = 60;

/**
 * ENG 1(2) PROBES FAULT is inhibited during the first 60 s of the flight phase 9.
 * @param flightPhase the FWC flight phase
 * @param secondsInFlightPhase the time since the FWC entered the flight phase, in seconds
 */
export function probesFaultInhibitedInPhase9(flightPhase: number, secondsInFlightPhase: number): boolean {
  return flightPhase === 9 && secondsInFlightPhase < PROBES_FAULT_PHASE_9_INHIBITION_SECONDS;
}

/**
 * ENG 1(2) FADEC ALTERNATOR is monitored while the engine runs. Design choice: the FADEC alternator is driven by the
 * engine gearbox, so its supply can only be lost (and detected) with the engine running; no condition is documented.
 */
export function isFadecAlternatorAlertActive(faultActive: boolean, engineRunning: boolean): boolean {
  return faultActive && engineRunning;
}

/**
 * The lines of ENG 1(2) SENSOR FAULT, by index in its codes (EwdMessages 7707351/7707352): 0 title, 1 -THR LEVER n IDLE,
 * 2 -ENG MASTER n OFF, 3 AVOID RAPID THR CHANGES.
 */
export function sensorFaultLines(onGround: boolean): number[] {
  return onGround ? [0, 1, 2] : [0, 3];
}

/** STATUS of ENG 1(2) SENSOR FAULT: AVOID RAPID THR CHANGES (StatusMessages 700400063) */
export const SENSOR_FAULT_STATUS = ['700400063'];
