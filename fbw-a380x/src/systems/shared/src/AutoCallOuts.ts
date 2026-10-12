// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** Bit flags for the radio auto call outs (for CONFIG_A380X_FWC_RADIO_AUTO_CALL_OUT_PINS). */
export enum A380XRadioAutoCallOutFlags {
  TwoThousandFiveHundred = 1 << 0,
  TwentyFiveHundred = 1 << 1,
  TwoThousand = 1 << 2,
  OneThousand = 1 << 3,
  FiveHundred = 1 << 4,
  FiveHundredGlide = 1 << 5,
  FourHundred = 1 << 6,
  ThreeHundred = 1 << 7,
  TwoHundred = 1 << 8,
  OneHundred = 1 << 9,

  Ninety = 1 << 10,
  Eighty = 1 << 11,
  Seventy = 1 << 12,
  Sixty = 1 << 13,
  Fifty = 1 << 14,
  Forty = 1 << 15,
  Thirty = 1 << 16,
  Twenty = 1 << 17,
  Ten = 1 << 18,
  Five = 1 << 19,
}

/** The default (Airbus basic configuration) radio altitude auto call outs. */
export const A380X_DEFAULT_RADIO_AUTO_CALL_OUTS =
  A380XRadioAutoCallOutFlags.TwoThousandFiveHundred |
  A380XRadioAutoCallOutFlags.OneThousand |
  A380XRadioAutoCallOutFlags.FourHundred |
  A380XRadioAutoCallOutFlags.Fifty |
  A380XRadioAutoCallOutFlags.Forty |
  A380XRadioAutoCallOutFlags.Thirty |
  A380XRadioAutoCallOutFlags.Twenty |
  A380XRadioAutoCallOutFlags.Ten |
  A380XRadioAutoCallOutFlags.Five;

/** Glide deviation, in dots, above which the smart FIVE HUNDRED is called out. */
const SMART_FIVE_HUNDRED_GLIDE_DEVIATION_DOTS = 0.5;

/**
 * Whether the FIVE HUNDRED callout is due when the aircraft descends through 500 ft.
 * A380 FCOM DSC-34-10-50 AUTOMATIC CALLOUTS (a380_fcom.txt 86490-86491, 86528): "FIVE HUNDRED or Smart FIVE HUNDRED";
 * the smart one "is triggered only if the glide deviation exceeds a half dot". Without a valid glide (no G/S, e.g. a
 * non-precision approach) the smart FIVE HUNDRED is called out like the normal one, as the A32NX FWC does.
 * @param pins the radio auto callout pin programming (A380XRadioAutoCallOutFlags)
 * @param glideValid the glide deviation is valid
 * @param glideDeviationDots glide deviation in dots (either sign)
 * @returns true when FIVE HUNDRED is to be called out
 */
export function isFiveHundredCalloutDue(pins: number, glideValid: boolean, glideDeviationDots: number): boolean {
  if ((pins & A380XRadioAutoCallOutFlags.FiveHundred) === 0) {
    return false;
  }
  if ((pins & A380XRadioAutoCallOutFlags.FiveHundredGlide) === 0) {
    return true;
  }
  return !glideValid || Math.abs(glideDeviationDots) > SMART_FIVE_HUNDRED_GLIDE_DEVIATION_DOTS;
}
