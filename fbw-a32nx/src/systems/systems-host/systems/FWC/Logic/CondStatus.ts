// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The STATUS page lines of an alert: the left column (limitations, information) and the inoperative systems */
export interface StatusLines {
  left: string[];
  inopSys: string[];
}

/** The codes of the air conditioning STATUS lines (see StatusMessages) */
export const CondStatusCodes = {
  maxFl100: '210400001',
  ckptAtFixedTemp: '210200001',
  cabAtFixedTemp: '210200002',
  cabTempByPackOnly: '210200003',
  cabTempCkptCtlOnly: '210200004',
  pack1: '210300001',
  pack2: '210300002',
  pack1And2: '210300003',
  condCtl1: '210300004',
  condCtl2: '210300005',
  condCtl1A: '210300006',
  condCtl1B: '210300007',
  condCtl2A: '210300008',
  condCtl2B: '210300009',
  hotAir: '210300010',
  cabFans: '210300011',
  galleyFan: '210300012',
} as const;

const C = CondStatusCodes;

/**
 * AIR PACK 1(2) FAULT (A320 FCOM PRO-ABN-AIR): PACK 1(2) inoperative; with the ACSC of that side lost, its zones are at a
 * fixed temperature (ACSC 1: the cockpit, ACSC 2: the cabin) and COND CTL 1(2) is inoperative. The FWD CRG HEAT line
 * of the FCOM is left out: the FBW A320 has no cargo heating.
 */
export function packFaultStatus(side: 1 | 2, acscFailed: boolean): StatusLines {
  return {
    left: acscFailed ? [side === 1 ? C.ckptAtFixedTemp : C.cabAtFixedTemp] : [],
    inopSys: [side === 1 ? C.pack1 : C.pack2, ...(acscFailed ? [side === 1 ? C.condCtl1 : C.condCtl2] : [])],
  };
}

/**
 * AIR PACK 1+2 FAULT (FCOM PRO-ABN-AIR), packs not recovered: MAX FL 100/MEA-MORA, cockpit and cabin at a fixed
 * temperature; PACK 1+2, COND CTL 1 and COND CTL 2 inoperative.
 */
export function pack1And2FaultStatus(): StatusLines {
  return { left: [C.maxFl100, C.ckptAtFixedTemp, C.cabAtFixedTemp], inopSys: [C.pack1And2, C.condCtl1, C.condCtl2] };
}

/** AIR PACK 1(2) OFF, i.e. the FWC's PACK 1(2) ABNORMALLY OFF (FCOM PRO-ABN-AIR): PACK 1(2) inoperative */
export function packOffStatus(side: 1 | 2): StatusLines {
  return { left: [], inopSys: [side === 1 ? C.pack1 : C.pack2] };
}

/** COND CTL 1(2)-A(B) FAULT (FCOM PRO-ABN-AIR): that lane inoperative */
export function condCtlLaneFaultStatus(controller: 1 | 2, lane: 'A' | 'B'): StatusLines {
  const code = { '1A': C.condCtl1A, '1B': C.condCtl1B, '2A': C.condCtl2A, '2B': C.condCtl2B }[`${controller}${lane}`]!;
  return { left: [], inopSys: [code] };
}

/**
 * COND CKPT/FWD CAB/AFT CAB DUCT OVHT (FCOM PRO-ABN-COND), system not recovered: basic temperature regulation by the
 * packs only, HOT AIR inoperative.
 */
export function ductOvhtStatus(): StatusLines {
  return { left: [C.cabTempByPackOnly], inopSys: [C.hotAir] };
}

/** COND L+R CAB FAN FAULT (FCOM PRO-ABN-COND): L+R CAB FAN inoperative */
export function cabFansFaultStatus(): StatusLines {
  return { left: [], inopSys: [C.cabFans] };
}

/**
 * COND LAV + GALLEY FAN FAULT (FCOM PRO-ABN-COND): with ACSC 2 operative only the cockpit temperature is controlled (the
 * FWD/AFT CABIN selectors set the cabin duct temperature directly); with ACSC 2 inoperative the cabin is at a fixed
 * temperature, PACK 2 and COND CTL 2 inoperative. GALLEY FAN inoperative in both cases.
 */
export function lavGalleyFanFaultStatus(acsc2Inoperative: boolean): StatusLines {
  return acsc2Inoperative
    ? { left: [C.cabAtFixedTemp], inopSys: [C.galleyFan, C.pack2, C.condCtl2] }
    : { left: [C.cabTempCkptCtlOnly], inopSys: [C.galleyFan] };
}

/**
 * COND HOT AIR FAULT (FCOM PRO-ABN-COND): with only the hot air closed (packs still on), basic temperature regulation by
 * the packs only; HOT AIR inoperative, and PACK 1+2 when the packs are off.
 */
export function hotAirFaultStatus(hotAirClosed: boolean, packsOff: boolean): StatusLines {
  return {
    left: hotAirClosed && !packsOff ? [C.cabTempByPackOnly] : [],
    inopSys: [...(packsOff ? [C.pack1And2] : []), C.hotAir],
  };
}

/** The STATUS fields of an FWC alert (statusInfo: the left column, inopSys: the right one) from its status lines */
export function alertStatus(lines: () => StatusLines): { statusInfo: () => string[]; inopSys: () => string[] } {
  return { statusInfo: () => lines().left, inopSys: () => lines().inopSys };
}
