// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The distance before the T/D at which the message is shown, in NM */
const DISTANCE_BEFORE_TOP_OF_DESCENT = 80;

/**
 * When to show the GPS IS DESELECTED (A320) / GPS DESELECTED (A380) message: with the GPS deselected by the flight crew,
 * "when the aircraft is less than 80 NM from the top of descent, or in approach phase" (A320 FCOM DSC-22_20-50-10-28,
 * A380 FCOM DSC-22-FMS-20-30). The message is sent at each of the two events and recalled when the GPS is selected again.
 */
export class GpsDeselectedMessageLogic {
  private nearTopOfDescent = false;

  private inApproach = false;

  private shown = false;

  /**
   * @param deselected whether the flight crew has deselected the GPS
   * @param approachPhase whether the FMS is in the approach phase
   * @param distanceToTopOfDescent the distance to the T/D, in NM (negative once past it), null without a T/D
   * @returns 'send' to show the message, 'recall' to remove it, null for no change
   */
  update(deselected: boolean, approachPhase: boolean, distanceToTopOfDescent: number | null): 'send' | 'recall' | null {
    const nearTopOfDescent =
      deselected && distanceToTopOfDescent !== null && distanceToTopOfDescent <= DISTANCE_BEFORE_TOP_OF_DESCENT;
    const inApproach = deselected && approachPhase;
    const reachedNow = (nearTopOfDescent && !this.nearTopOfDescent) || (inApproach && !this.inApproach);
    this.nearTopOfDescent = nearTopOfDescent;
    this.inApproach = inApproach;

    if (reachedNow) {
      this.shown = true;
      return 'send';
    }
    if (!deselected && this.shown) {
      this.shown = false;
      return 'recall';
    }
    return null;
  }
}
