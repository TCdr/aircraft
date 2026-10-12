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
 *   - SENSOR FAULT (l.172667-172692), PDF page 5804: phases 2 to 10 inhibited.
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
