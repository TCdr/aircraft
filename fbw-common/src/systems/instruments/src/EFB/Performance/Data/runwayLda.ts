// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The landing distance available of a runway end. The facility length is the paved length of the whole runway; the
 * landing roll of an end starts at its own displaced threshold, which the opposite end does not have to share.
 */

/** The displaced threshold lengths of a runway facility, in metres */
export interface FacilityThresholds {
  primaryThresholdLength?: number;
  secondaryThresholdLength?: number;
}

/** The displaced threshold in front of the landing end: 0 is the primary end (first designator), 1 the secondary */
export function displacedThresholdOfEnd(facility: FacilityThresholds, endIndex: 0 | 1): number {
  return (endIndex === 0 ? facility.primaryThresholdLength : facility.secondaryThresholdLength) ?? 0;
}

/** The runway length less the displaced threshold of the landing end, in metres */
export function landingDistanceAvailable(runway: { length: number; displacedThreshold?: number }): number {
  return Math.max(0, runway.length - (runway.displacedThreshold ?? 0));
}
