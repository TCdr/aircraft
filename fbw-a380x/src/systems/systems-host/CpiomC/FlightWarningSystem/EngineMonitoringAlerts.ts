// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * FADEC fault alerts of the A380, from the flyPad failures of the systems WASM:
 *
 * - ENG 1(2)(3)(4) HP FUEL VLV FAULT (systems engine/hp_fuel_valve_failure.rs writes
 *   L:A32NX_ENGINE_n_HP_FUEL_VALVE_FAULT): the HP fuel valve is failed closed or open. During the engine start:
 *   HP FUEL VALVE NOT OPEN, after a manual start ENG MAN START OFF and ENG MASTER OFF. During the engine shutdown:
 *   HP FUEL VALVE NOT CLOSED, after a manual start ENG MAN START OFF and ENG MASTER OFF (the engine shuts down when
 *   the LP fuel valve closes), on ground ENG FIRE P/B PUSH to close the LP valve. Single chime, MASTER CAUT, ENGINE
 *   SD page; inhibited in the phases 3, 4, 5, 6, 7, 9 and 10.
 * - The crew awareness alerts of the FADEC faults without engine model effect (systems engine/engine_monitoring_fault.rs
 *   writes one L:var per fault and engine), no aural, no MASTER light and no SD page:
 *   - FUEL STRAINER CLOGGED: phases 3 to 10 inhibited;
 *   - FUEL FILTER MONITORING FAULT: phases 1 to 10 inhibited;
 *   - OIL CHIP DETECTED: phases 1 to 10 inhibited;
 *   - MINOR FAULT (triggered after the flight if only one engine is affected): phases 2 to 10 inhibited;
 *   - OVERTHRUST PROT LOST (displayed after the flight if only one engine is affected): phases 2 to 10 inhibited;
 *   - SENSOR FAULT: phases 2 to 10 inhibited.
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
}

/** FUEL STRAINER CLOGGED, FUEL FILTER MONITORING FAULT, OIL CHIP DETECTED, MINOR FAULT, OVTHR PROT LOST, SENSOR FAULT */
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
];
