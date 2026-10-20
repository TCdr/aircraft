// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { VerticalWaypointPrediction } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import {
  isNoVertPathIntercept,
  speedErrorWaypoint,
  WaypointSpeedPrediction,
  waypointSpeedPredictions,
} from './VnavPathConditions';

const waypoint = (
  ident: string,
  distanceFromAircraft: number,
  predictedSpeed: number,
  constraintSpeed?: number,
): WaypointSpeedPrediction => ({ ident, distanceFromAircraft, predictedSpeed, constraintSpeed });

describe('SPD ERROR AT (waypoint)', () => {
  it('names the nearest waypoint ahead whose speed constraint is missed by more than 10 kt', () => {
    const waypoints = [
      waypoint('BEHIND', -2, 300, 250),
      waypoint('NOCSTR', 5, 300),
      waypoint('MET', 10, 255, 250),
      waypoint('MISSED', 20, 262, 250),
      waypoint('LATER', 30, 290, 250),
    ];
    expect(speedErrorWaypoint(waypoints, null)).toBe('MISSED');
  });

  it('does not show a miss of 10 kt or less', () => {
    expect(speedErrorWaypoint([waypoint('ABC', 10, 260, 250)], null)).toBe(null);
  });

  it('keeps the message until the predicted miss is within 5 kt', () => {
    expect(speedErrorWaypoint([waypoint('ABC', 10, 256, 250)], 'ABC')).toBe('ABC');
    expect(speedErrorWaypoint([waypoint('ABC', 10, 255, 250)], 'ABC')).toBe(null);
  });

  it('ignores a Mach prediction', () => {
    expect(speedErrorWaypoint([waypoint('ABC', 10, 0.78, 250)], null)).toBe(null);
  });

  it('orders the VNAV predictions along the flight plan, without discontinuities', () => {
    const prediction = (distanceFromAircraft: number, speed: number, constraint?: number) =>
      ({
        distanceFromAircraft,
        speed,
        speedConstraint: constraint !== undefined ? { speed: constraint } : undefined,
      }) as VerticalWaypointPrediction;
    const predictions = new Map([
      [4, prediction(40, 280, 250)],
      [2, prediction(20, 300)],
      [3, prediction(30, 280)],
    ]);
    const idents: Record<number, string | undefined> = { 2: 'AAA', 3: undefined, 4: 'CCC' };
    expect(waypointSpeedPredictions(predictions, (index) => idents[index])).toEqual([
      waypoint('AAA', 20, 300, undefined),
      waypoint('CCC', 40, 280, 250),
    ]);
  });
});

describe('NO VERT PATH INTERCEPT', () => {
  it('shows with FINAL armed, flying level more than 250 ft above the vertical profile', () => {
    expect(isNoVertPathIntercept(true, 0, 400)).toBe(true);
    expect(isNoVertPathIntercept(true, -150, 260)).toBe(true);
  });

  it('does not show without FINAL armed, in a descent, near or below the profile, or without a profile', () => {
    expect(isNoVertPathIntercept(false, 0, 400)).toBe(false);
    expect(isNoVertPathIntercept(true, -1000, 400)).toBe(false);
    expect(isNoVertPathIntercept(true, 0, 250)).toBe(false);
    expect(isNoVertPathIntercept(true, 0, -400)).toBe(false);
    expect(isNoVertPathIntercept(true, 0, null)).toBe(false);
  });
});
