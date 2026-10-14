// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The NO SMOKING (or NO PED) cabin signs. A320 FCOM DSC-33-40-10 Signs (a320_fcom.txt l.52345-52388):
 * - Switch positions: "ON : Signs are on in the cabin"; "AUTO : Signs are on in the cabin when either landing gear is
 *   extended or flaps/slats are extended (position 1, 2, 3, or FULL)"; "OFF : Signs are off in the cabin" (l.52357-52373).
 * - Note 1: "If the cabin altitude goes above 11 300 ft (+-350 ft), [...] all the cabin signs, except the NO PORTABLE
 *   ELEC DEVICE signs come on regardless of switches position." (l.52376-52378)
 * - Memo: "When the corresponding signs are on, the ECAM displays in green [...] the NO SMOKING message or the NO PED"
 *   (l.52387-52388), so the signs state is also the memo state (L:A32NX_NO_SMOKING_MEMO).
 */

/** XMLVAR_SWITCH_OVHD_INTLT_NOSMOKING_Position values */
export const NoSmokingSwitchPosition = {
  on: 0,
  auto: 1,
  off: 2,
} as const;

/** Cabin altitude above which the cabin signs come on whatever the switch position, ft */
export const CABIN_SIGNS_ON_CABIN_ALTITUDE_FT = 11_300;

/** A landing gear is considered extended beyond this position, percent (kept from the previous gear rule) */
const GEAR_EXTENDED_PERCENT = 50;

export interface NoSmokingSignsInputs {
  /** XMLVAR_SWITCH_OVHD_INTLT_NOSMOKING_Position: 0 ON, 1 AUTO, 2 OFF */
  readonly switchPosition: number;
  /** The positions of the left, right and nose landing gears, percent (0 up and locked, 100 down) */
  readonly gearPositionsPercent: readonly number[];
  /** The flaps/slats lever position, L:A32NX_FLAPS_HANDLE_INDEX (0 to 4) */
  readonly flapsLeverIndex: number;
  /** The cabin altitude, ft */
  readonly cabinAltitudeFt: number;
  /** The switch is the NO PORTABLE ELEC DEVICE switch (L:A32NX_CONFIG_USING_PORTABLE_DEVICES): no cabin altitude rule */
  readonly portableDevicesSigns: boolean;
}

/**
 * Whether the signs of the NO SMOKING (or NO PED) switch are on in the cabin
 * @param inputs the switch, landing gear, flaps lever and cabin altitude
 * @returns true when the signs are on
 */
export function areNoSmokingSignsOn(inputs: NoSmokingSignsInputs): boolean {
  if (!inputs.portableDevicesSigns && inputs.cabinAltitudeFt > CABIN_SIGNS_ON_CABIN_ALTITUDE_FT) {
    return true;
  }

  switch (inputs.switchPosition) {
    case NoSmokingSwitchPosition.on:
      return true;
    case NoSmokingSwitchPosition.auto:
      return (
        inputs.gearPositionsPercent.some((position) => position > GEAR_EXTENDED_PERCENT) || inputs.flapsLeverIndex > 0
      );
    default:
      return false;
  }
}

export interface SeatBeltsSignsInputs {
  /** The SEAT BELTS switch is ON (A:CABIN SEATBELTS ALERT SWITCH; the switch of the sim has no AUTO position) */
  readonly switchOn: boolean;
  /** The cabin altitude, ft */
  readonly cabinAltitudeFt: number;
}

/**
 * Whether the signs of the SEAT BELTS switch (FASTEN SEAT BELT, RETURN TO YOUR SEAT, l.52351) are on in the cabin:
 * switch ON, or cabin altitude above 11 300 ft whatever the switch (note 1, l.52376-52378). This is also the SEAT BELTS
 * memo state (l.52387-52388, L:A32NX_SEAT_BELTS_MEMO).
 * @param inputs the switch and the cabin altitude
 * @returns true when the signs are on
 */
export function areSeatBeltsSignsOn(inputs: SeatBeltsSignsInputs): boolean {
  return inputs.switchOn || inputs.cabinAltitudeFt > CABIN_SIGNS_ON_CABIN_ALTITUDE_FT;
}
