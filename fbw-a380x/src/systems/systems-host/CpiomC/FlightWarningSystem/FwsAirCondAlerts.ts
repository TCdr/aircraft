// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * AIR PACK, COND and CAB PRESS alerts of the A380X FWS fed by the pack (FDAC), ventilation (VCM) and outflow valve
 * (OCSM) controllers of the a380_systems air conditioning model (A380 FCOM PRO-ABN-ECAM-10-21-10 and -21-30). The
 * flight phase inhibitions are read from the FCOM inhibition figures (airbus-a380-fcom PDF pages given per alert).
 */

/** Something that holds an ARINC 429 discrete word (Arinc429Register, Arinc429Word) */
interface DiscreteWord {
  bitValueOr(bit: number, defaultValue: boolean): boolean;
}

/**
 * Bits of the CPIOM B AGS discrete word (L:A32NX_COND_CPIOM_B{n}_AGS_DISCRETE_WORD) set by the pack monitoring of the
 * FDACs (a380_systems air_conditioning/cpiom_b.rs, docs/a380-simvars.md).
 */
export const AGS_PACK_MONITORING_BITS = {
  /** Pack flow valves 1 to 4 (1 and 2 on pack 1, 3 and 4 on pack 2) failed open */
  valveFailedOpen: [15, 16, 17, 18],
  /** Pack flow valves 1 to 4 failed closed */
  valveFailedClosed: [19, 20, 21, 22],
  /** Packs 1 and 2: outlet temperature above 95 deg C */
  overheat: [23, 24],
  /** Packs 1 and 2 in bypass mode */
  bypassMode: [25, 26],
} as const;

/** Bits of the CPIOM B VCS discrete word (L:A32NX_COND_CPIOM_B{n}_VCS_DISCRETE_WORD) */
export const VCS_BULK_DUCT_OVHT_BIT = 25;
export const VCS_CABIN_AIR_EXTRACT_VLV_FAULT_BIT = 26;

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
 * AIR PACK 1(2) VLV 1(2) FAULT (a380_fcom.txt l.131940-131949): "One pack valve is failed open, or One pack valve is
 * failed closed, and: At least one pack valve on the other pack is failed closed, or The other pack is failed."
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
 * AIR PACK 1(2) VLV 1(2) FAULT flight phase inhibition: active in phases 1, 2, 8 and 12 (PDF p.4657). Indications:
 * PACK pb FAULT light and BLEED SD page, no aural and no master caution (failure level 1).
 */
export const PACK_VLV_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10, 11];

/**
 * AIR PACK 1(2) OVHT ("The pack outlet temperature is above 95 deg C", a380_fcom.txt l.131799) and AIR PACK 1(2)
 * REGUL FAULT flight phase inhibition: active in phases 1, 2, 8, 11 and 12 (PDF p.4653 and p.4655). Both have SC and
 * master caution.
 */
export const PACK_OVHT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];
export const PACK_REGUL_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];

/** Below FL 290 a pack in bypass mode is no longer available (AUTO RCL, a380_fcom.txt l.131911-131917) */
export const PACK_BYPASS_MODE_MIN_FL = 290;

/**
 * The lines of AIR PACK 1(2) REGUL FAULT (ata21-22-23.ts: IN BYPASS MODE, AVAIL ABOVE FL 290, WATER EXTRACT FAULT, RAM
 * AIR DOOR CLOSED, PACK ... OFF), a380_fcom.txt l.131893-131917: the bypass mode is the failure the model simulates; "Only
 * if the PACK 1(2) IN BYPASS MODE or PACK WATER EXTRACT FAULT message is displayed: PACK 1(2) AVAIL ABOVE FL 290, WHEN
 * BELOW FL 290 (AUTO RCL): PACK 1(2) ... OFF".
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
 * The STATUS INFO of AIR PACK 1(2) REGUL FAULT (a380_fcom.txt l.131926-131929): "If the PACK 1(2) IN BYPASS MODE ...
 * message is displayed: PACK 1(2) AVAIL ABOVE FL 290, PACK 1(2) REGUL DEGRADED".
 * @param pack the pack, 1 or 2
 * @returns the INFO ids
 */
export function packRegulFaultInfo(pack: 1 | 2): string[] {
  return pack === 1 ? ['210200004', '210200006'] : ['210200005', '210200007'];
}

/**
 * COND BULK CARGO DUCT OVHT (a380_fcom.txt l.132360-132410, 70 deg C l.132368): above 70 deg C in the bulk cargo duct (VCS bit 25). SC,
 * master caution, HEATER pb FAULT light, COND SD page; active in phases 1, 2, 8, 11 and 12 (PDF p.4669). The line is
 * BULK HEATER ... OFF.
 */
export const BULK_CARGO_DUCT_OVHT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];

/**
 * COND CABIN AIR EXTRACT VLV FAULT (a380_fcom.txt l.136032-136067, trigger l.136040): "The cabin air extract valve is failed." (VCS bit
 * 26). No indication (crew awareness), active in phases 10, 11 and 12 only (PDF p.4778).
 */
export const CABIN_AIR_EXTRACT_VLV_FAULT_PHASE_INHIBITION = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * CAB PRESS MAN CTL FAULT (a380_fcom.txt l.135534-135580, trigger l.135540): "The manual cabin pressurization mode is failed." SC,
 * master caution, CAB PRESS SD page; active in phases 6, 7, 10, 11 and 12 (PDF p.4766).
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

/**
 * CAB PRESS INHIBITED BY DOORS: active in flight phases 2, 3, 8 and 12 (FCOM PRO-ABN CAB PRESS INHIBITED BY DOORS,
 * flight phase inhibition figure, airbus-a380-fcom PDF p.4761); phase 12 was inhibited.
 */
export const CAB_PRESS_INHIBITED_BY_DOORS_PHASE_INHIBITION = [1, 4, 5, 6, 7, 9, 10, 11];

/** Bits 27/28 of the AGS word: an air cycle machine of pack 1/2 is failed, or both of them (bypass mode) */
export const AGS_PACK_REGUL_COMPONENT_FAILED_BITS = [27, 28] as const;
/** Bits 27/28 of the VCS word: the blowing fan of the pack bay 1/2 ventilation is failed */
export const VCS_PACK_BAY_BLOWING_FAN_FAILED_BITS = [27, 28] as const;
/** Bits 24/25 of the TCS word: the RAM air inlet 1/2 is no longer controlled by the RAM AIR pb */
export const TCS_RAM_AIR_INLET_FAULT_BITS = [24, 25] as const;
export const TCS_PURSER_TEMP_SEL_FAULT_BIT = 26;
export const TCS_MIXER_PRESS_HIGH_BIT = 27;
export const TCS_MIXER_PRESS_LOW_BIT = 28;
/** Bits 20 to 23 of the CPCS word: cabin pressure sensor 1 to 4 is failed */
export const CPCS_PRESSURE_SENSOR_FAILED_BITS = [20, 21, 22, 23] as const;

/**
 * AIR PACK 1+2 REGUL REDUNDANCY LOST, AIR PACK REGUL DEGRADED, AIR PACK BAY 1(2) VENT FAULT, COND MIXER PRESS REGUL
 * FAULT, COND PURSER TEMP SEL FAULT, COND RAM AIR 1(2) FAULT and CAB PRESS SENSORS FAULT flight phase inhibition. The
 * procedures do not give it; design choice: the one of the other pack and ventilation alerts (AIR PACK 1(2) REGUL
 * FAULT): active on ground and in cruise, not from takeoff to approach.
 */
export const COND_MONITORING_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];

/** The CABIN selector of the AIR panel turns past the ends of its 0-300 range into the PURS SEL position (see the ACS model) */
const CABIN_SELECTOR_MAX = 300;
const CABIN_SELECTOR_TURN = 400;
const CABIN_SELECTOR_DEAD_BAND_OFFSET = 50;

/**
 * @param cabinSelectorKnob the position of the CABIN selector (L:A32NX_OVHD_COND_CABIN_SELECTOR_KNOB)
 * @returns whether the cabin temperature comes from the purser selection of the flight attendant panel
 */
export function isCabinSelectorInPursSel(cabinSelectorKnob: number): boolean {
  const position = (cabinSelectorKnob % CABIN_SELECTOR_TURN) - CABIN_SELECTOR_DEAD_BAND_OFFSET;
  return position < 0 || position > CABIN_SELECTOR_MAX;
}

/**
 * AIR PACK 1+2 REGUL REDUNDANCY LOST: on each pack at least one regulation component is failed (an air cycle machine,
 * or both: bypass mode). A pack that is lost reports nothing, so a lost pack never counts.
 * @param componentFailed packs 1 and 2 have a failed regulation component
 * @returns whether the alert is true
 */
export function isPackRegulRedundancyLost(componentFailed: readonly [boolean, boolean]): boolean {
  return componentFailed[0] && componentFailed[1];
}

/**
 * AIR PACK REGUL DEGRADED: one pack is failed and the remaining pack no longer has the performance to regulate the
 * forward cargo temperature. Design choice (the FCOM gives no threshold): the remaining pack has a failed regulation
 * component (air cycle machine or bypass mode).
 * @param packFailed packs 1 and 2 are failed (both channels of their FDAC)
 * @param componentFailed packs 1 and 2 have a failed regulation component
 * @returns whether the alert is true
 */
export function isPackRegulDegraded(
  packFailed: readonly [boolean, boolean],
  componentFailed: readonly [boolean, boolean],
): boolean {
  return (
    (packFailed[0] && !packFailed[1] && componentFailed[1]) || (packFailed[1] && !packFailed[0] && componentFailed[0])
  );
}

/**
 * AIR PACK BAY 1(2) VENT FAULT and 1+2 VENT FAULT: the blowing fans of the pack bays are only used on ground.
 * @param blowingFanFailed the blowing fans of the pack bays 1 and 2 are failed
 * @param onGround the aircraft is on the ground
 * @returns the alerts for pack bay 1, pack bay 2, and both
 */
export function packBayVentFaults(
  blowingFanFailed: readonly [boolean, boolean],
  onGround: boolean,
): { bay1: boolean; bay2: boolean; both: boolean } {
  const both = onGround && blowingFanFailed[0] && blowingFanFailed[1];
  return {
    bay1: onGround && blowingFanFailed[0] && !blowingFanFailed[1],
    bay2: onGround && blowingFanFailed[1] && !blowingFanFailed[0],
    both,
  };
}

/**
 * The lines of COND MIXER PRESS REGUL FAULT: MIXER PRESS HI, and MIXER PRESS LO displayed only in the flight phase 1.
 * @param pressureHigh the pressure in the mixer unit is abnormally high
 * @param pressureLow the pressure in the mixer unit is abnormally low
 * @param flightPhase the flight phase number
 * @returns which lines are shown
 */
export function mixerPressRegulItemsToShow(
  pressureHigh: boolean,
  pressureLow: boolean,
  flightPhase: number,
): boolean[] {
  return [pressureHigh, pressureLow && flightPhase === 1];
}

/**
 * CAB PRESS SENSORS FAULT: only one or two of the four cabin pressure sensors remain available. With three left it is
 * CAB PRESS CTL REDUNDANCY LOST, with none CAB PRESS SYS FAULT.
 * @param sensorFailed the four cabin pressure sensors are failed
 * @returns whether the alert is true
 */
export function isCabPressSensorsFault(sensorFailed: readonly boolean[]): boolean {
  const available = sensorFailed.filter((failed) => !failed).length;
  return available === 1 || available === 2;
}
