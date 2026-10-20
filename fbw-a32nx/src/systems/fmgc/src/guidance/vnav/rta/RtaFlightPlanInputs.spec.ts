// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FlightPlanElement } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { VerticalWaypointPrediction } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { locateRtaWaypoint, rtaAllowedAt, RtaRevisedPlan, rtaWaypointPrediction } from './RtaFlightPlanInputs';
import { TimeConstraint, TimeConstraintType } from './TimeConstraint';

const leg = (ident: string) =>
  ({ isDiscontinuity: false, ident, definition: { waypoint: { databaseId: `W    ${ident}` } } }) as FlightPlanElement;
const discontinuity = { isDiscontinuity: true } as FlightPlanElement;

// origin, FROM, TO, ..., destination, missed approach
const legs = [leg('LFPG'), leg('PG270'), leg('KONAN'), discontinuity, leg('NEBRU'), leg('EGLL'), leg('MA001')];

const rtaAt = (ident: string): TimeConstraint => ({
  ident,
  databaseId: `W    ${ident}`,
  type: TimeConstraintType.At,
  utcSeconds: 0,
});

const plan: RtaRevisedPlan = {
  activeLegIndex: 2,
  originLegIndex: 0,
  firstMissedApproachLegIndex: 6,
  maybeElementAt: (index) => legs[index],
};

describe('locateRtaWaypoint', () => {
  it('finds the waypoint from the TO waypoint on', () => {
    expect(locateRtaWaypoint(legs, 2, rtaAt('NEBRU'))).toEqual({ index: 4, inPlan: true, ahead: true });
    expect(locateRtaWaypoint(legs, 2, rtaAt('KONAN'))).toEqual({ index: 2, inPlan: true, ahead: true });
  });

  it('a sequenced waypoint is behind the aircraft', () => {
    expect(locateRtaWaypoint(legs, 3, rtaAt('KONAN'))).toEqual({ index: 2, inPlan: true, ahead: false });
  });

  it('a waypoint replaced by an abeam point (other id) or cleared is not in the plan', () => {
    expect(locateRtaWaypoint(legs, 2, rtaAt('ABEAM'))).toEqual({ index: -1, inPlan: false, ahead: false });
  });
});

describe('rtaAllowedAt', () => {
  it('allows the TO waypoint, the next ones and the destination', () => {
    expect(rtaAllowedAt(plan, 2)).toBe(true);
    expect(rtaAllowedAt(plan, 4)).toBe(true);
    expect(rtaAllowedAt(plan, 5)).toBe(true);
  });

  it('refuses the origin, the FROM waypoint, a discontinuity and the missed approach', () => {
    expect(rtaAllowedAt({ ...plan, activeLegIndex: 0 }, 0)).toBe(false);
    expect(rtaAllowedAt(plan, 1)).toBe(false);
    expect(rtaAllowedAt(plan, 3)).toBe(false);
    expect(rtaAllowedAt(plan, 6)).toBe(false);
  });
});

describe('rtaWaypointPrediction', () => {
  const predictions = new Map<number, VerticalWaypointPrediction>([
    [4, { secondsFromPresent: 1200, distanceFromAircraft: 150 } as VerticalWaypointPrediction],
    [5, { secondsFromPresent: NaN, distanceFromAircraft: 200 } as VerticalWaypointPrediction],
  ]);

  it('gives the time and distance to the waypoint with the profile version', () => {
    expect(rtaWaypointPrediction(predictions, 7, 4)).toEqual({
      version: 7,
      secondsToWaypoint: 1200,
      distanceToWaypointNm: 150,
    });
  });

  it('is null without a valid prediction', () => {
    expect(rtaWaypointPrediction(predictions, 7, 5)).toBeNull();
    expect(rtaWaypointPrediction(predictions, 7, -1)).toBeNull();
    expect(rtaWaypointPrediction(undefined, 7, 4)).toBeNull();
  });
});
