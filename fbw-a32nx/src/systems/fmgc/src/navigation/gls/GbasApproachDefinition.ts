// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MathUtils, Runway } from '@flybywiresim/fbw-sdk';
import { Coordinates } from 'msfs-geo';
import {
  GbasApproach,
  isGbasChannel,
} from '../../../../../../../fbw-common/src/systems/shared/src/gbas/GbasApproachTable';

/**
 * Design choice: the charted course may differ this much from the magnetic bearing of the sim runway, in degrees. More
 * means scenery with another runway layout, and the GLS would end up beside the painted runway.
 */
export const MAX_COURSE_MISMATCH = 3;

/** The fields of the sim runway record that the GBAS geometry reads */
export type GbasRunwayRecord = Pick<Runway, 'ident' | 'bearing' | 'magneticBearing' | 'length'> & {
  thresholdLocation: Coordinates & { alt?: number };
};

/** Everything the receiver needs to compute the deviations of one GLS procedure */
export interface GbasApproachDefinition {
  channel: number;
  rpi: string;
  thresholdLocation: Coordinates;
  /** feet MSL */
  thresholdElevation: number;
  /** metres */
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
  if (!isGbasChannel(approach.channel)) {
    return { definition: null, rejection: 'channel-out-of-range' };
  }
  if (Math.abs(MathUtils.diffAngle(approach.course, runway.magneticBearing)) > MAX_COURSE_MISMATCH) {
    return { definition: null, rejection: 'course-mismatch' };
  }
  const thresholdElevation = runway.thresholdLocation.alt;
  if (thresholdElevation === undefined) {
    return { definition: null, rejection: 'threshold-elevation-missing' };
  }
  if (!(runway.length > 0)) {
    return { definition: null, rejection: 'runway-length-missing' };
  }

  return {
    definition: {
      channel: approach.channel,
      rpi: approach.rpi,
      thresholdLocation: { lat: runway.thresholdLocation.lat, long: runway.thresholdLocation.long },
      thresholdElevation,
      runwayLength: runway.length,
      courseTrue: runway.bearing,
      gpa: approach.gpa,
      tch: approach.tch,
    },
    rejection: null,
  };
}
