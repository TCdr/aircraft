// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MathUtils } from '@flybywiresim/fbw-sdk';
import { NavRadioUtils } from '@fmgc/navigation/NavRadioUtils';

/** The tuning of one MMR */
export interface TunedLandingSystem {
  frequency: number | null;
  course: number | null;
  /** the channel when the MMR is set to a GLS */
  glsChannel: number | null;
}

/** The landing system of the selected runway or approach */
export interface DatabaseLandingSystem {
  frequency: number | null;
  course: number | null;
  /** the channel when the selection is a GLS */
  glsChannel: number | null;
}

/** Maximum difference between the tuned and the database course, in degrees */
const COURSE_TOLERANCE = 3;

/**
 * RWY/LS mismatch: the landing system the crew tuned is not the one of the selected runway or approach. A GLS is
 * compared by its channel and an ILS by its frequency; an ILS against a GLS is a mismatch too, as they can not both
 * be the landing system of the runway the FMS selected.
 */
export function isRunwayLsMismatch(tuned: TunedLandingSystem, database: DatabaseLandingSystem): boolean {
  if (tuned.glsChannel !== null || database.glsChannel !== null) {
    const tunedSystemKnown = tuned.glsChannel !== null || tuned.frequency !== null;
    const databaseSystemKnown = database.glsChannel !== null || database.frequency !== null;
    if (tunedSystemKnown && databaseSystemKnown && tuned.glsChannel !== database.glsChannel) {
      return true;
    }
  } else if (
    tuned.frequency !== null &&
    database.frequency !== null &&
    !NavRadioUtils.vhfFrequenciesAreEqual(database.frequency, tuned.frequency)
  ) {
    return true;
  }

  return (
    tuned.course !== null &&
    database.course !== null &&
    Math.abs(MathUtils.diffAngle(database.course, tuned.course)) > COURSE_TOLERANCE
  );
}
