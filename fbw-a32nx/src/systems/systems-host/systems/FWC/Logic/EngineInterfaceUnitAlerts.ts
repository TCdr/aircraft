// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * ENG 1(2) EIU FAULT: the data bus between the Engine Interface Unit and the FADEC of the engine is lost. The systems
 * WASM (a320_systems engine_interface_unit.rs) writes L:A32NX_ENGINE_n_EIU_FAULT for an EIU that is failed or not
 * powered. Amber, crew awareness: the start of the engine, the A/THR and the reverser of the engine are lost, and only
 * the approach idle is available.
 */

/**
 * Design choice: the flight phases 3, 4, 5, 7 and 8 are inhibited, as for the other FADEC crew awareness cautions
 * (FADEC A(B) FAULT, FADEC ALTERNATOR): no published inhibition is available for this alert.
 */
export const EIU_FAULT_FLIGHT_PHASE_INHIBITION = [3, 4, 5, 7, 8];

/**
 * ENG 1(2) EIU FAULT is detected by the FADEC, which no longer receives the EIU data: it needs a powered FADEC.
 * @param eiuDataLost the FADEC no longer receives the data of its EIU (L:A32NX_ENGINE_n_EIU_FAULT)
 * @param fadecPowered the FADEC of the engine works (L:A32NX_FADEC_POWERED_ENGn)
 */
export function isEiuFaultAlertActive(eiuDataLost: boolean, fadecPowered: boolean): boolean {
  return eiuDataLost && fadecPowered;
}

/** The STATUS of ENG 1(2) EIU FAULT (StatusMessages codes) */
export interface EiuFaultStatus {
  left: string[];
  inopSys: string[];
}

export function eiuFaultStatus(engineNumber: 1 | 2): EiuFaultStatus {
  const engine1 = engineNumber === 1;
  return {
    // ENG n APPR IDLE ONLY, CAT 2 ONLY
    left: [engine1 ? '240200103' : '240200104', '240200102'],
    // A/THR, CAT 3, REVERSER n, ENG n START
    inopSys: ['730300011', '730300012', engine1 ? '730300013' : '730300014', engine1 ? '730300015' : '730300016'],
  };
}
