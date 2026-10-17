// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { bearingTo } from 'msfs-geo';
import { FmsError, FmsErrorType } from '@fmgc/FmsError';
import { ReadonlyFlightPlanElement } from '@fmgc/flightplanning/legs/ReadonlyFlightPlanLeg';

/**
 * The four DIRECT TO / INTERCEPT functions of the MCDU DIR TO page: DIRECT TO, ABEAM PTS, RADIAL IN, RADIAL OUT.
 * - ABEAM PTS: the abeam waypoints along the direct leg.
 * - RADIAL IN [4R] / RADIAL OUT [5R]: the DIR TO temporary F-PLN intercepts that radial into (from) the waypoint, the
 *   intercept point computed on the current aircraft track. Entry: 3 digits, 000 to 360, with M or T for magnetic or
 *   true. The FMS proposes a default radial in when the DIR TO waypoint is in the F-PLN.
 */
export enum DirectToFunction {
  Direct,
  AbeamPoints,
  RadialIn,
  RadialOut,
}

/** A radial of a RADIAL IN or RADIAL OUT entry */
export interface DirectToRadial {
  /** degrees, 0 to 359 */
  course: number;
  /** true when the radial is a true value (T entered), magnetic otherwise */
  isTrue: boolean;
}

/**
 * Parses a RADIAL IN / RADIAL OUT entry: up to 3 digits, 000 to 360, optionally followed by M or T (magnetic by default)
 * @throws FmsError FORMAT ERROR or ENTRY OUT OF RANGE
 */
export function parseDirectToRadial(entry: string): DirectToRadial {
  const match = entry.match(/^([0-9]{1,3})([MT]?)$/);
  if (match === null) {
    throw new FmsError(FmsErrorType.FormatError);
  }
  const course = parseInt(match[1]);
  if (course > 360) {
    throw new FmsError(FmsErrorType.EntryOutOfRange);
  }
  return { course: course % 360, isTrue: match[2] === 'T' };
}

/** The termination fix of a flight plan element, when it is a leg ending at a fix */
function fixLocationOf(element: ReadonlyFlightPlanElement | undefined) {
  if (!element || element.isDiscontinuity === true || !element.isXF()) {
    return undefined;
  }
  return element.terminationWaypoint()?.location;
}

/**
 * The default RADIAL IN of a DIR TO waypoint of the flight plan, as a true course: the flight plan track to the
 * waypoint, or the track from it when a discontinuity is before it.
 * @param targetLegIndex the index of the DIR TO waypoint in the flight plan
 * @returns the true course, degrees, or null when there is no flight plan track to or from the waypoint
 */
export function defaultRadialInTrueCourse(
  elements: readonly ReadonlyFlightPlanElement[],
  targetLegIndex: number,
): number | null {
  const target = fixLocationOf(elements[targetLegIndex]);
  if (!target) {
    return null;
  }
  const previous = elements[targetLegIndex - 1];
  if (previous && previous.isDiscontinuity === false) {
    const previousFix = fixLocationOf(previous);
    return previousFix ? bearingTo(previousFix, target) : null;
  }
  const nextFix = fixLocationOf(elements[targetLegIndex + 1]);
  return nextFix ? bearingTo(target, nextFix) : null;
}
