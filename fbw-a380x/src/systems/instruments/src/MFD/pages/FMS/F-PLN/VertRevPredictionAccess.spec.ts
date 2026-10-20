// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { ProfilePhase } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { altitudePredictionPanel, isPredictedCruiseWaypoint } from './VertRevPredictionAccess';

function panelForAltitudeOf(planIndex: FlightPlanIndex, isAltnWaypoint: boolean, phase: ProfilePhase | undefined) {
  return altitudePredictionPanel(isPredictedCruiseWaypoint(planIndex, isAltnWaypoint, phase));
}

describe('the VERT REV panel opened by the altitude prediction of a F-PLN waypoint', () => {
  it('is STEP ALTs for a cruise waypoint', () => {
    expect(panelForAltitudeOf(FlightPlanIndex.Active, false, ProfilePhase.Cruise)).toBe('step-alts');
  });

  it('is ALT for a climb or descent waypoint', () => {
    expect(panelForAltitudeOf(FlightPlanIndex.Active, false, ProfilePhase.Climb)).toBe('alt');
    expect(panelForAltitudeOf(FlightPlanIndex.Active, false, ProfilePhase.Descent)).toBe('alt');
  });

  it('is ALT without a prediction, on the alternate and on a SEC flight plan', () => {
    expect(panelForAltitudeOf(FlightPlanIndex.Active, false, undefined)).toBe('alt');
    expect(panelForAltitudeOf(FlightPlanIndex.Active, true, ProfilePhase.Cruise)).toBe('alt');
    expect(panelForAltitudeOf(FlightPlanIndex.FirstSecondary, false, ProfilePhase.Cruise)).toBe('alt');
  });
});
