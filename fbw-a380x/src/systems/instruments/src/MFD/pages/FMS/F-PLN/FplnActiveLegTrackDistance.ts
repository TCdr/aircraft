// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export interface FplnLegTrackDistance {
  track: number | null;
  distance: number | null;
}

/** The guidance values the ND shows for the TO waypoint; negative when there is none, as on a manual leg. */
export interface ToWaypointFromPresentPosition {
  bearing: number;
  distance: number;
}

export interface ActiveLegLineInputs {
  planned: FplnLegTrackDistance;
  toWaypoint: ToWaypointFromPresentPosition;
  inFlight: boolean;
  isActivePlan: boolean;
  /** The TO waypoint line, or the pseudo waypoint line before it when one lies on the active leg. */
  isFirstLineOfActiveLeg: boolean;
  /** Planned distance from this line to the TO waypoint: non-zero only for a pseudo waypoint line. */
  plannedDistanceAfterLine: number;
}

/**
 * In flight the active leg of the active flight plan starts at the aircraft, so its first line shows the direct bearing
 * and distance from the present position. The TMPY and SEC plans are not flown, so they keep the planned leg values.
 */
export function activeLegLineTrackAndDistance(inputs: ActiveLegLineInputs): FplnLegTrackDistance {
  const { planned, toWaypoint, inFlight, isActivePlan, isFirstLineOfActiveLeg, plannedDistanceAfterLine } = inputs;
  const toWaypointKnown =
    Number.isFinite(toWaypoint.bearing) &&
    Number.isFinite(toWaypoint.distance) &&
    toWaypoint.bearing >= 0 &&
    toWaypoint.distance >= 0;

  if (!inFlight || !isActivePlan || !isFirstLineOfActiveLeg || !toWaypointKnown) {
    return planned;
  }

  return {
    track: toWaypoint.bearing,
    distance: Math.max(0, toWaypoint.distance - plannedDistanceAfterLine),
  };
}
