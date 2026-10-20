// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FlightPlanElement, isLeg } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { ReadonlyFlightPlanElement } from '@fmgc/flightplanning/legs/ReadonlyFlightPlanLeg';
import { VerticalWaypointPrediction } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { RtaWaypointPrediction } from './RtaManager';
import { TimeConstraint } from './TimeConstraint';

export interface RtaWaypointLocation {
  /** flight plan index of the RTA waypoint, -1 when it is not in the flight plan */
  index: number;
  inPlan: boolean;
  /** the RTA waypoint is the TO waypoint or after it */
  ahead: boolean;
}

/**
 * Finds the RTA waypoint in a flight plan: first from the TO waypoint on, then behind the aircraft (sequenced). A DIR
 * TO with ABEAM replaces the waypoint by an abeam point of another id, so the waypoint is then no longer in the plan.
 */
export function locateRtaWaypoint(
  legs: readonly (FlightPlanElement | ReadonlyFlightPlanElement)[],
  activeLegIndex: number,
  rta: TimeConstraint,
): RtaWaypointLocation {
  const isRtaWaypoint = (element: FlightPlanElement | ReadonlyFlightPlanElement) =>
    isLeg(element) && element.definition.waypoint?.databaseId === rta.databaseId;
  const firstAhead = Math.max(0, activeLegIndex);
  for (let i = firstAhead; i < legs.length; i++) {
    if (isRtaWaypoint(legs[i])) {
      return { index: i, inPlan: true, ahead: true };
    }
  }
  const behind = legs.slice(0, firstAhead).findIndex(isRtaWaypoint);
  return { index: behind, inPlan: behind >= 0, ahead: false };
}

/** What the RTA revision needs to know of a flight plan */
export interface RtaRevisedPlan {
  readonly activeLegIndex: number;
  readonly originLegIndex: number;
  readonly firstMissedApproachLegIndex: number;
  maybeElementAt(index: number): FlightPlanElement | ReadonlyFlightPlanElement | undefined;
}

/**
 * Whether a waypoint of the primary flight plan can have an RTA: any waypoint from the TO waypoint on, the
 * destination included, but not the origin, the FROM waypoint or a missed approach waypoint.
 */
export function rtaAllowedAt(plan: RtaRevisedPlan, legIndex: number): boolean {
  const element = plan.maybeElementAt(legIndex);
  return (
    isLeg(element) &&
    !!element.definition.waypoint &&
    legIndex >= plan.activeLegIndex &&
    legIndex !== plan.originLegIndex &&
    legIndex < plan.firstMissedApproachLegIndex
  );
}

/** The VNAV prediction at a flight plan index of the active flight plan, null without one */
export function rtaWaypointPrediction(
  predictions: ReadonlyMap<number, VerticalWaypointPrediction> | undefined,
  profileVersion: number,
  legIndex: number,
): RtaWaypointPrediction | null {
  const prediction = legIndex >= 0 ? predictions?.get(legIndex) : undefined;
  if (!prediction || !Number.isFinite(prediction.secondsFromPresent)) {
    return null;
  }
  return {
    version: profileVersion,
    secondsToWaypoint: prediction.secondsFromPresent,
    distanceToWaypointNm: Math.max(0, prediction.distanceFromAircraft),
  };
}
