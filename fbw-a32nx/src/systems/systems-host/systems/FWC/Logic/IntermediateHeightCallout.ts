// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The intermediate radio height callout of the A320 FWC.
 * a320_fcom.txt l.53585-53594 (DSC-34-NAV-40-10 RADIO ALTIMETER, INTERMEDIATE CALL OUT): "If time between two
 * consecutive predetermined call outs exceeds a certain threshold, the present height is repeated at regular
 * intervals. The threshold is: 11 s above 50 ft, 4 s below 50 ft. The repeating interval is 4 s."
 * a320_fcom.txt l.53581-53583: "If the aircraft remains at a height that is in the detection zone for a height
 * callout, the corresponding message is repeated at regular intervals." (covered too: in a detection zone the present
 * height is the word of that zone).
 *
 * Design choices (the A320 FCOM does not give them):
 * - Only below 410 ft, the top of the FOUR HUNDRED detection zone: the FWC logic of FwsAutoCallouts already splits
 *   the heights at 410 ft and 50 ft for this callout, and the A380 FCOM (a380_fcom.txt l.86539) has its intermediate
 *   callout "below 400 ft".
 * - The present height is said with the words of the FWC height callouts, rounded down: FOUR HUNDRED, THREE HUNDRED,
 *   TWO HUNDRED, ONE HUNDRED, FIFTY, FORTY, THIRTY, TWENTY, TEN, FIVE. These are the voices of the aircraft sound bank;
 *   other heights would need words in another voice. Rounding down never calls a height above the aircraft (the A380
 *   FCOM rounds its intermediate callout down too, l.86545-86547).
 * - The time is counted from the last predetermined callout, or from the descent below 410 ft.
 * - The callout waits while the callouts are inhibited (the inhibitions of the FWC height callouts: radio height
 *   invalid, climbing, on ground, MINIMUM / HUNDRED ABOVE, GPWS or TCAS aural, RETARD).
 */

/** The heights the FWC can say (the A32NX_FWS_AUDIO_<height> callouts), highest first */
export const INTERMEDIATE_CALLOUT_HEIGHTS = [400, 300, 200, 100, 50, 40, 30, 20, 10, 5] as const;

export type IntermediateCalloutHeight = (typeof INTERMEDIATE_CALLOUT_HEIGHTS)[number];

/** The intermediate callout is made below this radio height, in feet (see the design choices) */
export const INTERMEDIATE_CALLOUT_CEILING_FT = 410;

/** Above this radio height the threshold is 11 s, below it 4 s (a320_fcom.txt l.53591-53592) */
export const INTERMEDIATE_CALLOUT_THRESHOLD_HEIGHT_FT = 50;

export const INTERMEDIATE_CALLOUT_THRESHOLD_HIGH_SECONDS = 11;

export const INTERMEDIATE_CALLOUT_THRESHOLD_LOW_SECONDS = 4;

/** The repeating interval (a320_fcom.txt l.53594) */
export const INTERMEDIATE_CALLOUT_REPEAT_SECONDS = 4;

/**
 * The word for the present height: the highest callout height at or below it.
 * @param height the radio height in feet
 * @returns the height to say, or null below the lowest word
 */
export function intermediateCalloutHeight(height: number): IntermediateCalloutHeight | null {
  for (const word of INTERMEDIATE_CALLOUT_HEIGHTS) {
    if (height >= word) {
      return word;
    }
  }
  return null;
}

export class IntermediateHeightCallout {
  /** Seconds since the last callout (predetermined or intermediate), or since the descent below 410 ft */
  private secondsSinceLastCallout = 0;

  /** The last callout was an intermediate one: the next one comes after the repeating interval */
  private lastCalloutWasIntermediate = false;

  /**
   * @param height the radio height in feet, null when invalid
   * @param predeterminedCalloutNow a predetermined callout (a height, MINIMUM, HUNDRED ABOVE or RETARD) is made now
   * @param inhibited the height callouts are inhibited now
   * @param deltaTimeSeconds the time since the last update
   * @returns the height to say now, else null
   */
  public update(
    height: number | null,
    predeterminedCalloutNow: boolean,
    inhibited: boolean,
    deltaTimeSeconds: number,
  ): IntermediateCalloutHeight | null {
    const word = height !== null && height < INTERMEDIATE_CALLOUT_CEILING_FT ? intermediateCalloutHeight(height) : null;
    if (height === null || word === null || predeterminedCalloutNow) {
      this.secondsSinceLastCallout = 0;
      this.lastCalloutWasIntermediate = false;
      return null;
    }

    this.secondsSinceLastCallout += deltaTimeSeconds;
    let threshold: number;
    if (this.lastCalloutWasIntermediate) {
      threshold = INTERMEDIATE_CALLOUT_REPEAT_SECONDS;
    } else if (height > INTERMEDIATE_CALLOUT_THRESHOLD_HEIGHT_FT) {
      threshold = INTERMEDIATE_CALLOUT_THRESHOLD_HIGH_SECONDS;
    } else {
      threshold = INTERMEDIATE_CALLOUT_THRESHOLD_LOW_SECONDS;
    }

    if (this.secondsSinceLastCallout >= threshold && !inhibited) {
      this.secondsSinceLastCallout = 0;
      this.lastCalloutWasIntermediate = true;
      return word;
    }
    return null;
  }
}
