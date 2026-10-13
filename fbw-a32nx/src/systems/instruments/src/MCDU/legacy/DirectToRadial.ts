// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { bearingTo } from 'msfs-geo';
import { FmsError, FmsErrorType } from '@fmgc/FmsError';
import { ReadonlyFlightPlanElement } from '@fmgc/flightplanning/legs/ReadonlyFlightPlanLeg';

/**
 * The DIRECT TO / INTERCEPT functions of the MCDU DIR TO page.
 *
 * A320 FCOM DSC-22_20-50-10-28 DIRECT TO PAGE (a320_fcom.txt l.18291-18292): "These are four DIRECT TO/INTERCEPT
 * functions: DIRECT TO, ABEAM PTS, RADIAL IN, RADIAL OUT."; l.18352-18360: "[4R] RADIAL IN and [5R] RADIAL OUT The pilot
 * fills in these fields to define a radial associated to the waypoint. Selecting a radial in (out) will activate the
 * intercept radial into (from) the specified waypoint in the DIR TO temporary F-PLN. The pilot enters the radial in, or
 * radial out, as XXX, XXX being the radial. An M or T may also be entered, referring to a MAG or a True value. A default
 * radial in is proposed by the FMS if the DIR TO waypoint is part of the F-PLN."
 * Data entry format (l.23685-23688): RADIAL IN / RADIAL OUT "NNN(T) 3 digits entry", "000 - 360", degrees.
 * DSC-22_20-30-10-18 (l.14399-14404): "The DIR TO/ABEAM function, computes the abeam waypoints along the direct leg";
 * "The DIR TO/INTCPT function allows the definition of a specified RADIAL INBOUND or OUTBOUND at an inserted waypoint.
 * The current aircraft track is used to compute the INTCPT point with the specified radial."
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
 * The default RADIAL IN of a DIR TO waypoint of the flight plan, as a true course (A320 FCOM DSC-22_20-30-10-18
 * PROCEDURE FOR DIR TO/INTERCEPT, l.14600-14605): "If the DIR TO waypoint belongs to the flight plan and is not preceded
 * by a discontinuity, the system displays the flight plan track to the DIR TO waypoint as the default inbound radial. If
 * the DIR TO waypoint belongs to the flight plan and is preceded by a discontinuity, the system displays the flight plan
 * track from the DIR TO waypoint as the default inbound radial."
 * @param elements the flight plan elements
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
