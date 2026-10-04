// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Thrust limit type of the FADEC (L:A32NX_AUTOTHRUST_THRUST_LIMIT_TYPE, athr_thrust_limit_type in
 * A380FadecComputer_types.h). The EGT gauge used to compare the thrust lever angle in degrees with these numbers.
 */
export enum ThrustLimitType {
  None = 0,
  Clb = 1,
  Mct = 2,
  Flex = 3,
  Toga = 4,
  Reverse = 5,
}

/** EGT at which the indication turns red (FBW engine value) */
const EGT_RED_C = 900;
/** EGT limit, amber above it (FBW engine value) */
const EGT_LIMIT_C = 850;

/**
 * Whether the amber EGT limit applies. A380 FCOM DSC-70-90 EGT LIMIT: "The amber indication does not appear: During
 * takeoff, or When thrust reversers are selected [...]".
 * @param limitType the thrust limit type
 * @returns true when the amber limit (line and amber colour) applies
 */
export function egtLimitMarkVisible(limitType: number): boolean {
  return (
    limitType !== ThrustLimitType.Flex && limitType !== ThrustLimitType.Toga && limitType !== ThrustLimitType.Reverse
  );
}

/**
 * Colour of the EGT value and needle: red above the red line, amber above the EGT limit (A380 FCOM DSC-70-90 EGT
 * INDICATIONS).
 * @param egt the EGT in degrees Celsius
 * @param limitType the thrust limit type
 * @returns 'Red', 'Amber' or 'Green'
 */
export function egtColour(egt: number, limitType: number): 'Red' | 'Amber' | 'Green' {
  if (egt >= EGT_RED_C) {
    return 'Red';
  }
  if (egt > EGT_LIMIT_C && egtLimitMarkVisible(limitType)) {
    return 'Amber';
  }
  return 'Green';
}

/**
 * The EEC trims the EGT to a maximum value: the red line at take-off thrust (FLEX/TOGA), the EGT limit otherwise.
 * @param egt the EGT in degrees Celsius
 * @param limitType the thrust limit type
 * @returns the trimmed EGT
 */
export function trimmedEgt(egt: number, limitType: number): number {
  return Math.min(
    limitType === ThrustLimitType.Flex || limitType === ThrustLimitType.Toga ? EGT_RED_C : EGT_LIMIT_C,
    egt,
  );
}
