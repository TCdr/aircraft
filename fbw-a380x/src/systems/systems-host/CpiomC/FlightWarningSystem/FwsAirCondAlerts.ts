// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * AIR PACK, COND and CAB PRESS alerts of the A380X FWS fed by the pack (FDAC), ventilation (VCM) and outflow valve
 * (OCSM) controllers of the a380_systems air conditioning model.
 */

/** Something that holds an ARINC 429 discrete word (Arinc429Register, Arinc429Word) */
interface DiscreteWord {
  bitValueOr(bit: number, defaultValue: boolean): boolean;
}

/**
 * Bits of the CPIOM B AGS discrete word (L:A32NX_COND_CPIOM_B{n}_AGS_DISCRETE_WORD) set by the pack monitoring of the
 * FDACs (a380_systems air_conditioning/cpiom_b.rs, docs/a380-simvars.md).
 */
const AGS_PACK_MONITORING_BITS = {
  valveFailedOpen: [15, 16, 17, 18],
  valveFailedClosed: [19, 20, 21, 22],
  /** Packs 1 and 2: outlet temperature above 95 deg C */
  overheat: [23, 24],
  bypassMode: [25, 26],
} as const;

/** Bits of the CPIOM B VCS discrete word (L:A32NX_COND_CPIOM_B{n}_VCS_DISCRETE_WORD) */
export const VCS_BULK_DUCT_OVHT_BIT = 25;
export const VCS_CABIN_AIR_EXTRACT_VLV_FAULT_BIT = 26;

/**
 * Bits of the CPIOM B avionics ventilation discrete word (L:A32NX_COND_CPIOM_B{n}_AVS_DISCRETE_WORD, a380_systems
 * air_conditioning/cpiom_b.rs, docs/a380-simvars.md)
 */
export const AVS_BITS = {
  /** The left (L) / right (R) avionics ventilation circuit gets no air (blowing fan and backup valve lost) */
  leftCircuitNotVentilated: 13,
  rightCircuitNotVentilated: 14,
  extractFault: 15,
  overboardValveFault: 16,
  overboardValveFullyOpen: 17,
  controllerFault: 18,
  coolingSystem1Overheat: 19,
  coolingSystem2Overheat: 20,
  coolingProtectionFault: 21,
  thsBayVentilationFault: 22,
} as const;

/**
 * Flight phase inhibition of the VENT AVNCS, VENT COOLG and VENT THS BAY alerts (the source gives no inhibition figure).
 * Design choice: the take-off and landing inhibition of the other COND cautions without a flight-critical action,
 * active in all other phases.
 */
export const AVIONICS_VENTILATION_PHASE_INHIBITION = [3, 4, 5, 7];

/** The manual cabin vertical speed knob at its maximum (the CAB V/S TRGT line of VENT AVNCS OVBD VLV FAULT) */
export const MAN_CABIN_VS_MAX_FPM = 2500;

/** The pack monitoring of both FDACs, as the FWS reads it */
export interface PackMonitoringFlags {
  /** Pack flow valves 1 to 4 (1 and 2 on pack 1, 3 and 4 on pack 2) failed open */
  valveFailedOpen: [boolean, boolean, boolean, boolean];
  /** Pack flow valves 1 to 4 failed closed */
  valveFailedClosed: [boolean, boolean, boolean, boolean];
  /** Packs 1 and 2 overheat */
  overheat: [boolean, boolean];
  /** Packs 1 and 2 in bypass mode */
  bypassMode: [boolean, boolean];
}

/**
 * Reads the pack monitoring of each pack from the AGS word of the CPIOM B pair that controls it (B1/B3 pack 1, B2/B4
 * pack 2, as the PACK CTL alerts). No data reads as no fault.
 * @param pack1Word the AGS discrete word used for pack 1
 * @param pack2Word the AGS discrete word used for pack 2
 * @returns the pack monitoring flags
 */
export function readPackMonitoringFlags(pack1Word: DiscreteWord, pack2Word: DiscreteWord): PackMonitoringFlags {
  const wordOfValve = (valveIndex: number) => (valveIndex < 2 ? pack1Word : pack2Word);
  const valveBits = (bits: readonly number[]) =>
    bits.map((bit, valveIndex) => wordOfValve(valveIndex).bitValueOr(bit, false)) as [
      boolean,
      boolean,
      boolean,
      boolean,
    ];
  const packBits = (bits: readonly number[]): [boolean, boolean] => [
    pack1Word.bitValueOr(bits[0], false),
    pack2Word.bitValueOr(bits[1], false),
  ];
  return {
    valveFailedOpen: valveBits(AGS_PACK_MONITORING_BITS.valveFailedOpen),
    valveFailedClosed: valveBits(AGS_PACK_MONITORING_BITS.valveFailedClosed),
    overheat: packBits(AGS_PACK_MONITORING_BITS.overheat),
    bypassMode: packBits(AGS_PACK_MONITORING_BITS.bypassMode),
  };
}

/**
 * AIR PACK 1(2) VLV 1(2) FAULT: a pack valve is failed open, or failed closed while at least one valve of the other
 * pack is failed closed or the other pack is failed.
 * @param flags the pack monitoring flags
 * @param packFailed packs 1 and 2 are failed (both channels of their FDAC, the AIR PACK 1(2) FAULT condition)
 * @returns for pack 1 valve 1, pack 1 valve 2, pack 2 valve 1 and pack 2 valve 2 whether the alert is true
 */
export function packValveFaults(
  flags: PackMonitoringFlags,
  packFailed: readonly [boolean, boolean],
): [boolean, boolean, boolean, boolean] {
  return [0, 1, 2, 3].map((valveIndex) => {
    const pack = valveIndex < 2 ? 0 : 1;
    const otherPack = 1 - pack;
    const otherPackValveFailedClosed =
      flags.valveFailedClosed[otherPack * 2] || flags.valveFailedClosed[otherPack * 2 + 1];
    return (
      flags.valveFailedOpen[valveIndex] ||
      (flags.valveFailedClosed[valveIndex] && (otherPackValveFailedClosed || packFailed[otherPack]))
    );
  }) as [boolean, boolean, boolean, boolean];
}

/**
 * AIR PACK 1(2) VLV 1(2) FAULT flight phase inhibition: active in phases 1, 2, 8 and 12. Indications: PACK pb FAULT
 * light and BLEED SD page, no aural and no master caution (failure level 1).
 */
export const PACK_VLV_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10, 11];

/**
 * AIR PACK 1(2) OVHT (pack outlet temperature above 95 deg C) and AIR PACK 1(2) REGUL FAULT flight phase inhibition:
 * active in phases 1, 2, 8, 11 and 12. Both have SC and master caution.
 */
export const PACK_OVHT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];
export const PACK_REGUL_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];

/** Below FL 290 a pack in bypass mode is no longer available (AUTO RCL) */
const PACK_BYPASS_MODE_MIN_FL = 290;

/**
 * The lines of AIR PACK 1(2) REGUL FAULT (ata21-22-23.ts: IN BYPASS MODE, AVAIL ABOVE FL 290, WATER EXTRACT FAULT, RAM
 * AIR DOOR CLOSED, PACK ... OFF). The bypass mode is the failure the model simulates; with it the procedure shows
 * PACK 1(2) AVAIL ABOVE FL 290 and, below FL 290 (AUTO RCL), PACK 1(2) ... OFF.
 * @param flightLevel the flight level (pressure altitude / 100)
 * @param packPbOn the PACK pb of the pack is ON
 * @returns which lines are shown and which are checked
 */
export function packRegulFaultItems(flightLevel: number, packPbOn: boolean): { show: boolean[]; checked: boolean[] } {
  const belowFl290 = flightLevel < PACK_BYPASS_MODE_MIN_FL;
  return {
    show: [true, true, false, false, belowFl290],
    checked: [false, false, false, false, !packPbOn],
  };
}

/**
 * The STATUS INFO of AIR PACK 1(2) REGUL FAULT in bypass mode: PACK 1(2) AVAIL ABOVE FL 290, PACK 1(2) REGUL DEGRADED.
 * @param pack the pack, 1 or 2
 * @returns the INFO ids
 */
export function packRegulFaultInfo(pack: 1 | 2): string[] {
  return pack === 1 ? ['210200004', '210200006'] : ['210200005', '210200007'];
}

/**
 * COND BULK CARGO DUCT OVHT: above 70 deg C in the bulk cargo duct (VCS bit 25). SC, master caution, HEATER pb FAULT
 * light, COND SD page; active in phases 1, 2, 8, 11 and 12. The line is BULK HEATER ... OFF.
 */
export const BULK_CARGO_DUCT_OVHT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];

/**
 * COND CABIN AIR EXTRACT VLV FAULT: the cabin air extract valve is failed (VCS bit 26). No indication (crew
 * awareness), active in phases 10, 11 and 12 only.
 */
export const CABIN_AIR_EXTRACT_VLV_FAULT_PHASE_INHIBITION = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * CAB PRESS MAN CTL FAULT: the manual cabin pressurization mode is failed. SC, master caution, CAB PRESS SD page;
 * active in phases 6, 7, 10, 11 and 12.
 */
export const CAB_PRESS_MAN_CTL_FAULT_PHASE_INHIBITION = [1, 2, 3, 4, 5, 8, 9];

/**
 * The manual pressurization mode is failed: an operating outflow valve controller reports its manual control failed
 * (L:A32NX_PRESS_OCSM_{n}_MAN_CTL_FAILURE; a controller with both channels failed reports nothing).
 * @param ocsmManCtlFailures the four OCSM reports
 * @returns whether CAB PRESS MAN CTL FAULT is true
 */
export function isCabPressManCtlFault(ocsmManCtlFailures: readonly boolean[]): boolean {
  return ocsmManCtlFailures.some((failed) => failed);
}

/** CAB PRESS INHIBITED BY DOORS: active in flight phases 2, 3, 8 and 12 */
export const CAB_PRESS_INHIBITED_BY_DOORS_PHASE_INHIBITION = [1, 4, 5, 6, 7, 9, 10, 11];
