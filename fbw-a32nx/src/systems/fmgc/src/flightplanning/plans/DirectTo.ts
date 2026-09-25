// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import {
  bearingTo,
  Coordinates,
  diffAngle,
  distanceTo,
  placeBearingDistance,
  placeBearingIntersection,
} from 'msfs-geo';

/**
 * The course of a DIR TO with course interception (A380 FCOM DSC-22-FMS, DIR TO revision): CRS IN intercepts an inbound
 * course to the target waypoint, CRS OUT an outbound course from it.
 */
export interface DirectToInterceptCourse {
  /** Course in degrees, magnetic unless {@link isTrue} */
  course: number;
  /** Whether the course is a true course */
  isTrue: boolean;
  /** true for CRS IN (inbound to the target waypoint), false for CRS OUT (outbound from it) */
  inbound: boolean;
}

const EARTH_RADIUS_NM = 3440.065;

/**
 * The abeam point of a waypoint on a direct leg: its projection on the great circle from the start to the end of the
 * leg (A380 FCOM DSC-22-FMS, DIRECT WITH ABEAM).
 * @returns the abeam point and its distance from the start of the leg, or null when the projection is not between the
 * start and the end of the leg
 */
export function abeamPointOnLeg(
  from: Coordinates,
  to: Coordinates,
  point: Coordinates,
): { location: Coordinates; distanceFromStart: number } | null {
  const legLength = distanceTo(from, to);
  const angularDistance = distanceTo(from, point) / EARTH_RADIUS_NM;
  const legBearing = bearingTo(from, to);
  const angle = ((bearingTo(from, point) - legBearing) * Math.PI) / 180;

  const crossTrack = Math.asin(Math.sin(angularDistance) * Math.sin(angle));
  const alongTrack =
    Math.sign(Math.cos(angle)) *
    Math.acos(Math.min(1, Math.cos(angularDistance) / Math.cos(crossTrack))) *
    EARTH_RADIUS_NM;

  if (!(alongTrack > 0 && alongTrack < legLength)) {
    return null;
  }
  return { location: placeBearingDistance(from, legBearing, alongTrack), distanceFromStart: alongTrack };
}

/** Ident of an abeam waypoint: AB and the first five characters of the reference fix (A380 FCOM DSC-22-FMS-20-30) */
export function abeamWaypointIdent(referenceIdent: string): string {
  return `AB${referenceIdent.substring(0, 5)}`;
}

/** CRS IN: no intercept point when the angle between the direct leg and the inbound course is more than 160° (FCOM) */
const MAX_CRS_IN_INTERCEPT_ANGLE = 160;

/**
 * The intercept point (INTCPT) of a CRS IN or CRS OUT DIR TO: where the current track from the aircraft meets the
 * course line through the target waypoint (A380 FCOM DSC-22-FMS, DIR TO revision).
 * @param trueCourse the inbound (CRS IN) or outbound (CRS OUT) true course of the target waypoint
 * @returns the intercept point, or null when there is none: behind the aircraft, a CRS IN intercept after the target or
 * more than 160° from the track, or a CRS OUT course parallel to the track
 */
export function directToInterceptPoint(
  ppos: Coordinates,
  trueTrack: number,
  target: Coordinates,
  trueCourse: number,
  inbound: boolean,
): Coordinates | null {
  const interceptAngle = Math.abs(diffAngle(trueTrack, trueCourse));
  if (inbound ? interceptAngle > MAX_CRS_IN_INTERCEPT_ANGLE : interceptAngle < 1 || interceptAngle > 179) {
    return null;
  }

  const ahead = placeBearingIntersection(ppos, trueTrack, target, trueCourse)
    .filter((point) => {
      const distance = distanceTo(ppos, point);
      return distance > 0.1 && distance < 5000 && Math.abs(diffAngle(trueTrack, bearingTo(ppos, point))) < 90;
    })
    .sort((a, b) => distanceTo(ppos, a) - distanceTo(ppos, b));
  const intercept = ahead[0];
  if (!intercept) {
    return null;
  }
  // CRS IN: the inbound course leads from the intercept to the target
  if (
    inbound &&
    (distanceTo(intercept, target) < 0.1 || Math.abs(diffAngle(trueCourse, bearingTo(intercept, target))) > 90)
  ) {
    return null;
  }
  return intercept;
}
