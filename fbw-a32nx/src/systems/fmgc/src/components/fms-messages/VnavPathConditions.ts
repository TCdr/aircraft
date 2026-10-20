// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { VerticalWaypointPrediction } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';

/*
 * The trigger conditions of the FMS messages on the VNAV predictions and the vertical path, shared by the A320 MCDU
 * and the A380 MFD.
 */

/** A speed constraint is missed when the predicted speed is above it by more than this, in knots */
const SPEED_ERROR_SET_MARGIN = 10;

/** SPD ERROR AT clears when the predicted speed comes back within this of the constraint, in knots */
const SPEED_ERROR_CLEAR_MARGIN = 5;

/** NO VERT PATH INTERCEPT: the aircraft is more than this above the FMS vertical profile, in feet */
const NO_VERT_PATH_INTERCEPT_DEVIATION = 250;

/**
 * Design choice: "flying level" for NO VERT PATH INTERCEPT is a vertical speed below this (ft/min), to cover ALT, a V/S
 * or FPA of zero, and the small vertical speed of an altitude hold.
 */
const LEVEL_FLIGHT_MAX_VERTICAL_SPEED = 300;

/** The predicted speed and the speed constraint at a flight plan waypoint ahead of the aircraft */
export interface WaypointSpeedPrediction {
  ident: string;
  /** NM along the flight plan */
  distanceFromAircraft: number;
  /** predicted CAS in knots, or a Mach (below 1) above the crossover altitude */
  predictedSpeed: number;
  /** the speed constraint (at or below) in knots CAS, undefined without one */
  constraintSpeed: number | undefined;
}

/**
 * SPD ERROR AT (waypoint): the nearest waypoint ahead where the predicted speed is above the speed constraint by more than
 * 10 kt. The message for a waypoint stays until the predicted miss there comes back within 5 kt.
 * @param waypoints the waypoints ahead of the aircraft, in flight plan order
 * @param shownIdent the waypoint of the message on display, null without one
 * @returns the waypoint ident of the message, or null
 */
export function speedErrorWaypoint(
  waypoints: readonly WaypointSpeedPrediction[],
  shownIdent: string | null,
): string | null {
  for (const waypoint of waypoints) {
    if (waypoint.distanceFromAircraft <= 0 || waypoint.constraintSpeed === undefined) {
      continue;
    }
    // Speed constraints are CAS: a Mach prediction is above the altitude of any speed constraint
    if (!Number.isFinite(waypoint.predictedSpeed) || waypoint.predictedSpeed < 1) {
      continue;
    }
    const error = waypoint.predictedSpeed - waypoint.constraintSpeed;
    const margin = waypoint.ident === shownIdent ? SPEED_ERROR_CLEAR_MARGIN : SPEED_ERROR_SET_MARGIN;
    if (error > margin) {
      return waypoint.ident;
    }
  }
  return null;
}

/**
 * The speed predictions at the waypoints of the active flight plan ahead of the aircraft
 * @param predictions the VNAV predictions by leg index
 * @param identAt the ident of the leg at an index, undefined for a discontinuity
 */
export function waypointSpeedPredictions(
  predictions: ReadonlyMap<number, VerticalWaypointPrediction>,
  identAt: (legIndex: number) => string | undefined,
): WaypointSpeedPrediction[] {
  const waypoints: WaypointSpeedPrediction[] = [];
  for (const [legIndex, prediction] of predictions) {
    const ident = identAt(legIndex);
    if (ident === undefined) {
      continue;
    }
    waypoints.push({
      ident,
      distanceFromAircraft: prediction.distanceFromAircraft,
      predictedSpeed: prediction.speed,
      constraintSpeed: prediction.speedConstraint?.speed,
    });
  }
  return waypoints.sort((a, b) => a.distanceFromAircraft - b.distanceFromAircraft);
}

/**
 * NO VERT PATH INTERCEPT: FINAL is armed and the aircraft flies level more than 250 ft above the FMS vertical profile.
 * @param finalArmed the FINAL mode is armed
 * @param verticalSpeed in ft/min
 * @param linearDeviation the altitude above the vertical profile in feet, null when not computed
 */
export function isNoVertPathIntercept(
  finalArmed: boolean,
  verticalSpeed: number,
  linearDeviation: number | null,
): boolean {
  return (
    finalArmed &&
    Math.abs(verticalSpeed) < LEVEL_FLIGHT_MAX_VERTICAL_SPEED &&
    linearDeviation !== null &&
    linearDeviation > NO_VERT_PATH_INTERCEPT_DEVIATION
  );
}
