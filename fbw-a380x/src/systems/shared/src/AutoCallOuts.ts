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

/*
 * The intermediate callout, a380_fcom.txt l.86537-86547 (DSC-34-10-50 INTERMEDIATE CALLOUT): "Below 400 ft, if the
 * time between two consecutive predetermined callouts exceeds a certain threshold, an intermediate callout is
 * triggered at regular time intervals. Between 400 ft and 100 ft, the intermediate callout is triggered 11 s after the
 * previous predetermined callout. Below 100 ft, the intermediate callout is triggered 4 s after the previous
 * predetermined callout. The intermediate callout calls out the current aircraft height. Between 400 ft and 100 ft,
 * the height is rounded to the lower 10 ft (e.g. TWO HUNDRED AND TWENTY). Below 100 ft, the height is rounded to the
 * lower feet."
 *
 * Design choices:
 * - The height is said with the voices of the aircraft sound bank, one hundreds word and one tens word (TWO HUNDRED,
 *   TWENTY): the bank has no AND and no unit words. Below 100 ft the height is therefore rounded to the lower 10 ft
 *   too (FIFTY for 57 ft), and FIVE from 5 to 9 ft: the unit feet of the FCOM would need nine more words in another
 *   voice.
 * - "At regular time intervals": the next intermediate callout comes after the same time (11 s, 4 s below 100 ft).
 * - The time is counted from the last callout, or from the descent below 400 ft.
 * - The callout waits while the height callouts would not be made (radio height invalid, on ground, climbing, GPWS
 *   alert, RETARD), see LegacyGpws.
 */

/** The intermediate callout is made below this radio height, in feet (a380_fcom.txt l.86539) */
export const INTERMEDIATE_CALLOUT_CEILING_FT = 400;

/** Below this height the intermediate callout comes after 4 s instead of 11 s (a380_fcom.txt l.86541-86543) */
export const INTERMEDIATE_CALLOUT_LOW_BAND_FT = 100;

export const INTERMEDIATE_CALLOUT_HIGH_BAND_SECONDS = 11;

export const INTERMEDIATE_CALLOUT_LOW_BAND_SECONDS = 4;

/** The words of an intermediate callout, as FwsSoundManager aurals: hundreds first, then tens */
export type IntermediateCalloutAural =
  | 'intermediate_100'
  | 'intermediate_200'
  | 'intermediate_300'
  | 'intermediate_90'
  | 'intermediate_80'
  | 'intermediate_70'
  | 'intermediate_60'
  | 'intermediate_50'
  | 'intermediate_40'
  | 'intermediate_30'
  | 'intermediate_20'
  | 'intermediate_10'
  | 'intermediate_5';

/**
 * The words that say a height, rounded down to 10 ft (to 5 ft below 10 ft).
 * @param height the radio height in feet, below 400 ft
 * @returns the words in the order they are said, empty below 5 ft
 */
export function intermediateCalloutWords(height: number): IntermediateCalloutAural[] {
  const words: IntermediateCalloutAural[] = [];
  const hundreds = Math.floor(height / 100);
  const tens = Math.floor((height % 100) / 10);
  if (hundreds >= 1 && hundreds <= 3) {
    words.push(`intermediate_${hundreds * 100}` as IntermediateCalloutAural);
  }
  if (tens >= 1) {
    words.push(`intermediate_${tens * 10}` as IntermediateCalloutAural);
  } else if (hundreds === 0 && height >= 5) {
    words.push('intermediate_5');
  }
  return words;
}

export class IntermediateCallout {
  /** Seconds since the last callout (predetermined or intermediate), or since the descent below 400 ft */
  private secondsSinceLastCallout = 0;

  /**
   * @param height the radio height in feet, null when invalid
   * @param predeterminedCalloutNow a predetermined callout (a height, MINIMUM, HUNDRED ABOVE or RETARD) is made now
   * @param inhibited the height callouts are not made now
   * @param deltaTimeSeconds the time since the last update
   * @returns the words to say now, empty when there is no callout
   */
  public update(
    height: number | null,
    predeterminedCalloutNow: boolean,
    inhibited: boolean,
    deltaTimeSeconds: number,
  ): IntermediateCalloutAural[] {
    if (height === null || height >= INTERMEDIATE_CALLOUT_CEILING_FT || predeterminedCalloutNow) {
      this.secondsSinceLastCallout = 0;
      return [];
    }
    const words = intermediateCalloutWords(height);
    if (words.length === 0) {
      this.secondsSinceLastCallout = 0;
      return [];
    }

    this.secondsSinceLastCallout += deltaTimeSeconds;
    const threshold =
      height < INTERMEDIATE_CALLOUT_LOW_BAND_FT
        ? INTERMEDIATE_CALLOUT_LOW_BAND_SECONDS
        : INTERMEDIATE_CALLOUT_HIGH_BAND_SECONDS;
    if (this.secondsSinceLastCallout >= threshold && !inhibited) {
      this.secondsSinceLastCallout = 0;
      return words;
    }
    return [];
  }
}
