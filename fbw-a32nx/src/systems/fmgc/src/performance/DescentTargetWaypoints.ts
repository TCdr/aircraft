// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  AltitudeConstraint,
  AltitudeDescriptor,
  FmsDescentAltitudeConstraint,
  FmsDescentWaypoint,
} from '@flybywiresim/fbw-sdk';

/** A leg of the flight plan, as the waypoint list reads it */
export interface DescentTargetLeg {
  isDiscontinuity: false;
  ident: string;
  altitudeConstraint: AltitudeConstraint | undefined;
  calculated?: { cumulativeDistanceToEndWithTransitions: number };
  terminationWaypoint(): unknown | null;
}

/** The part of a flight plan the waypoint list reads */
export interface DescentTargetPlan {
  activeLegIndex: number;
  firstMissedApproachLegIndex: number;
  maybeElementAt(index: number): DescentTargetLeg | { isDiscontinuity: true } | undefined;
}

/**
 * The altitude constraint of a leg as a descent target: the ARINC 424 descriptors of the approach (glideslope, vertical
 * angle) keep their altitude 1 meaning
 * @param constraint the altitude constraint of the leg
 * @returns the constraint, or null when the leg has none
 */
export function descentTargetConstraint(
  constraint: AltitudeConstraint | undefined,
): FmsDescentAltitudeConstraint | null {
  if (!constraint || constraint.altitude1 === undefined) {
    return null;
  }
  switch (constraint.altitudeDescriptor) {
    case AltitudeDescriptor.AtAlt1:
    case AltitudeDescriptor.AtAlt1GsMslAlt2:
    case AltitudeDescriptor.AtAlt1GsIntcptAlt2:
    case AltitudeDescriptor.AtAlt1AngleAlt2:
      return { type: 'at', altitude1: constraint.altitude1 };
    case AltitudeDescriptor.AtOrAboveAlt1:
    case AltitudeDescriptor.AtOrAboveAlt1GsMslAlt2:
    case AltitudeDescriptor.AtOrAboveAlt1GsIntcptAlt2:
    case AltitudeDescriptor.AtOrAboveAlt1AngleAlt2:
      return { type: 'atOrAbove', altitude1: constraint.altitude1 };
    case AltitudeDescriptor.AtOrBelowAlt1:
    case AltitudeDescriptor.AtOrBelowAlt1AngleAlt2:
      return { type: 'atOrBelow', altitude1: constraint.altitude1 };
    case AltitudeDescriptor.BetweenAlt1Alt2:
      return constraint.altitude2 !== undefined
        ? { type: 'between', altitude1: constraint.altitude1, altitude2: constraint.altitude2 }
        : { type: 'atOrBelow', altitude1: constraint.altitude1 };
    default:
      // At or above altitude 2 (C): a climb constraint of the SIDs
      return null;
  }
}

/**
 * The waypoints of the flight plan from the active leg up to the missed approach, for the flypad descent calculator:
 * the distance of each from the aircraft is the distance to the destination less its distance to the end of the flight
 * plan (as LNAV computes the distance to the destination)
 * @param plan the active flight plan
 * @param distanceToDestination the distance along the flight plan to the destination, in NM, or null
 * @returns the waypoints ahead
 */
export function descentTargetWaypoints(
  plan: DescentTargetPlan,
  distanceToDestination: number | null,
): FmsDescentWaypoint[] {
  const waypoints: FmsDescentWaypoint[] = [];
  for (let i = Math.max(plan.activeLegIndex, 0); i < plan.firstMissedApproachLegIndex; i++) {
    const leg = plan.maybeElementAt(i);
    if (!leg || leg.isDiscontinuity === true || leg.terminationWaypoint() === null) {
      continue;
    }
    const toEnd = leg.calculated?.cumulativeDistanceToEndWithTransitions;
    const distance =
      distanceToDestination !== null && toEnd !== undefined && Number.isFinite(toEnd)
        ? Math.max(0, distanceToDestination - toEnd)
        : null;
    waypoints.push({ ident: leg.ident, distance, constraint: descentTargetConstraint(leg.altitudeConstraint) });
  }
  return waypoints;
}
