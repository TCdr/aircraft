// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The NO SMOKING (or NO PED) cabin signs:
 * - ON: signs on; AUTO: signs on when a landing gear or the flaps/slats (lever 1, 2, 3 or FULL) are extended; OFF: off.
 * - Above 11 300 ft cabin altitude every cabin sign except NO PORTABLE ELEC DEVICE comes on, whatever the switch.
 * - The ECAM memo shows while the signs are on, so the signs state is also the memo state (L:A32NX_NO_SMOKING_MEMO).
 */

/** XMLVAR_SWITCH_OVHD_INTLT_NOSMOKING_Position values */
export const NoSmokingSwitchPosition = {
  on: 0,
  auto: 1,
  off: 2,
} as const;

/** Cabin altitude above which the cabin signs come on whatever the switch position, ft */
const CABIN_SIGNS_ON_CABIN_ALTITUDE_FT = 11_300;

/** A landing gear is extended beyond this position, percent. Design choice: the aircraft has no stated threshold */
const GEAR_EXTENDED_PERCENT = 50;

export interface NoSmokingSignsInputs {
  /** XMLVAR_SWITCH_OVHD_INTLT_NOSMOKING_Position: 0 ON, 1 AUTO, 2 OFF */
  readonly switchPosition: number;
  /** The positions of the left, right and nose landing gears, percent (0 up and locked, 100 down) */
  readonly gearPositionsPercent: readonly number[];
  /** The flaps/slats lever position, L:A32NX_FLAPS_HANDLE_INDEX (0 to 4) */
  readonly flapsLeverIndex: number;
  readonly cabinAltitudeFt: number;
  /** NO PORTABLE ELEC DEVICE switch (L:A32NX_CONFIG_USING_PORTABLE_DEVICES): no cabin altitude rule */
  readonly portableDevicesSigns: boolean;
}

/**
 * Whether the signs of the NO SMOKING (or NO PED) switch are on in the cabin
 * @param inputs the switch, landing gear, flaps lever and cabin altitude
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
  readonly cabinAltitudeFt: number;
}

/**
 * Whether the signs of the SEAT BELTS switch (FASTEN SEAT BELT, RETURN TO YOUR SEAT) are on in the cabin: switch ON, or
 * cabin altitude above 11 300 ft whatever the switch. This is also the SEAT BELTS memo state (L:A32NX_SEAT_BELTS_MEMO).
 * @param inputs the switch and the cabin altitude
 */
export function areSeatBeltsSignsOn(inputs: SeatBeltsSignsInputs): boolean {
  return inputs.switchOn || inputs.cabinAltitudeFt > CABIN_SIGNS_ON_CABIN_ALTITUDE_FT;
}
