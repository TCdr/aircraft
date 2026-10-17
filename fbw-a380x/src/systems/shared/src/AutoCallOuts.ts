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
 * Whether the FIVE HUNDRED callout is due when the aircraft descends through 500 ft. The smart FIVE HUNDRED is made
 * only when the glide deviation exceeds half a dot. Without a valid glide (no G/S, e.g. a non-precision approach) the
 * smart FIVE HUNDRED is called out like the normal one, as the A32NX FWC does.
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
 * The intermediate callout: below 400 ft, when no predetermined callout comes for a while, the current height is called
 * out at regular intervals: 11 s after the previous predetermined callout between 400 ft and 100 ft (height rounded
 * down to 10 ft), 4 s after it below 100 ft (height rounded down to the foot).
 *
 * Design choices:
 * - The height is said word by word. From 100 ft: the hundreds word and the tens word of the aircraft sound bank
 *   (TWO HUNDRED, TWENTY; the bank has no AND). Below 100 ft: the tens word of the bank, then the unit word (FORTY
 *   SEVEN), and TEN to NINETEEN as one word. The bank has TEN to NINETY and FIVE; ONE to NINE (but FIVE) and ELEVEN to
 *   NINETEEN are WAV clips of tools/fws-voice/generate.py (another voice, see FwsSoundManager).
 * - "At regular time intervals": the next intermediate callout comes after the same time (11 s, 4 s below 100 ft).
 * - The time is counted from the last callout, or from the descent below 400 ft.
 * - The callout waits while the height callouts would not be made (radio height invalid, on ground, climbing, GPWS
 *   alert, RETARD), see LegacyGpws.
 */

export const INTERMEDIATE_CALLOUT_CEILING_FT = 400;

/** Below this height the intermediate callout comes after 4 s instead of 11 s */
const INTERMEDIATE_CALLOUT_LOW_BAND_FT = 100;

const INTERMEDIATE_CALLOUT_HIGH_BAND_SECONDS = 11;

const INTERMEDIATE_CALLOUT_LOW_BAND_SECONDS = 4;

/** The words of an intermediate callout, as FwsSoundManager aurals: hundreds, then tens, then units */
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
  | 'intermediate_19'
  | 'intermediate_18'
  | 'intermediate_17'
  | 'intermediate_16'
  | 'intermediate_15'
  | 'intermediate_14'
  | 'intermediate_13'
  | 'intermediate_12'
  | 'intermediate_11'
  | 'intermediate_10'
  | 'intermediate_9'
  | 'intermediate_8'
  | 'intermediate_7'
  | 'intermediate_6'
  | 'intermediate_5'
  | 'intermediate_4'
  | 'intermediate_3'
  | 'intermediate_2'
  | 'intermediate_1';

/**
 * The words that say a height: rounded down to 10 ft from 100 ft (TWO HUNDRED TWENTY), to the foot below 100 ft
 * (FORTY SEVEN, THIRTEEN, SIX).
 * @param height the radio height in feet, below 400 ft
 * @returns the words in the order they are said, empty below 1 ft
 */
export function intermediateCalloutWords(height: number): IntermediateCalloutAural[] {
  const words: IntermediateCalloutAural[] = [];
  const feet = Math.floor(height);
  const hundreds = Math.floor(feet / 100);
  const tens = Math.floor((feet % 100) / 10);
  const units = feet % 10;
  if (hundreds >= 1) {
    if (hundreds <= 3) {
      words.push(`intermediate_${hundreds * 100}` as IntermediateCalloutAural);
    }
    if (tens >= 1) {
      words.push(`intermediate_${tens * 10}` as IntermediateCalloutAural);
    }
  } else if (tens === 1) {
    // TEN to NINETEEN: one word
    words.push(`intermediate_${feet}` as IntermediateCalloutAural);
  } else {
    if (tens >= 2) {
      words.push(`intermediate_${tens * 10}` as IntermediateCalloutAural);
    }
    if (units >= 1) {
      words.push(`intermediate_${units}` as IntermediateCalloutAural);
    }
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
