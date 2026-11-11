// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MathUtils, Runway } from '@flybywiresim/fbw-sdk';
import { Coordinates, distanceTo } from 'msfs-geo';
import {
  GbasApproach,
  isGbasChannel,
} from '../../../../../../../fbw-common/src/systems/shared/src/gbas/GbasApproachTable';

/**
 * Design choice: the charted course may differ this much from the magnetic bearing of the sim runway, in degrees. More
 * means scenery with another runway layout, and the GLS would end up beside the painted runway.
 */
export const MAX_COURSE_MISMATCH = 3;

const METRES_PER_NAUTICAL_MILE = 1852;

/** The fields of the sim runway record that the GBAS geometry reads */
export type GbasRunwayRecord = Pick<Runway, 'ident' | 'bearing' | 'magneticBearing' | 'length'> & {
  thresholdLocation: Coordinates & { alt?: number };
  /** Where the pavement starts: before the threshold when the threshold is displaced */
  startLocation?: Coordinates;
};

/** Everything the receiver needs to compute the deviations of one GLS procedure */
export interface GbasApproachDefinition {
  channel: number;
  rpi: string;
  thresholdLocation: Coordinates;
  /** feet MSL */
  thresholdElevation: number;
  /** metres, from the threshold to the stop end */
  runwayLength: number;
  /** degrees true */
  courseTrue: number;
  /** degrees, positive */
  gpa: number;
  /** feet */
  tch: number;
}

export type GbasApproachRejection =
  | 'runway-missing'
  | 'runway-data-invalid'
  | 'channel-out-of-range'
  | 'course-mismatch'
  | 'threshold-elevation-missing'
  | 'runway-length-missing';

export type GbasApproachDefinitionResult =
  | { definition: GbasApproachDefinition; rejection: null }
  | { definition: null; rejection: GbasApproachRejection };

/**
 * The threshold position, elevation, length and true course always come from the sim runway, so the autoland touches
 * down on the runway the user sees; only the slope and crossing height, which differ between procedures, come from the
 * table.
 * @returns the definition, or the reason the procedure cannot be flown on this runway
 */
export function defineGbasApproach(
  approach: GbasApproach,
  runway: GbasRunwayRecord | null,
): GbasApproachDefinitionResult {
  if (!runway) {
    return { definition: null, rejection: 'runway-missing' };
  }
  const { thresholdLocation, startLocation } = runway;
  // A number that is not finite passes every range check below, and the receiver would compute deviations from it
  if (
    !Number.isFinite(runway.bearing) ||
    !Number.isFinite(runway.magneticBearing) ||
    !Number.isFinite(thresholdLocation.lat) ||
    !Number.isFinite(thresholdLocation.long)
  ) {
    return { definition: null, rejection: 'runway-data-invalid' };
  }
  if (!isGbasChannel(approach.channel)) {
    return { definition: null, rejection: 'channel-out-of-range' };
  }
  if (Math.abs(MathUtils.diffAngle(approach.course, runway.magneticBearing)) > MAX_COURSE_MISMATCH) {
    return { definition: null, rejection: 'course-mismatch' };
  }
  const thresholdElevation = thresholdLocation.alt;
  if (thresholdElevation === undefined || !Number.isFinite(thresholdElevation)) {
    return { definition: null, rejection: 'threshold-elevation-missing' };
  }
  // The receiver puts its lateral reference this far past the threshold, just beyond the stop end. The length of the
  // sim runway is the whole pavement: with a displaced threshold it would move that reference too far out
  const displacedThresholdLength = startLocation
    ? distanceTo(startLocation, thresholdLocation) * METRES_PER_NAUTICAL_MILE
    : 0;
  const runwayLength = runway.length - displacedThresholdLength;
  if (!(runwayLength > 0) || !Number.isFinite(runwayLength)) {
    return { definition: null, rejection: 'runway-length-missing' };
  }

  return {
    definition: {
      channel: approach.channel,
      rpi: approach.rpi,
      thresholdLocation: { lat: thresholdLocation.lat, long: thresholdLocation.long },
      thresholdElevation,
      runwayLength,
      courseTrue: runway.bearing,
      gpa: approach.gpa,
      tch: approach.tch,
    },
    rejection: null,
  };
}
