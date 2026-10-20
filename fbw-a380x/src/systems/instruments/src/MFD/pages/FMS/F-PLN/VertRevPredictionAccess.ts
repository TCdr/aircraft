// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { ProfilePhase } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';

/**
 * Whether a F-PLN waypoint belongs to the cruise phase, which decides the VERT REV panel its predictions open.
 * Only the active flight plan has vertical predictions; the alternate has no cruise.
 * @param profilePhase the phase of the waypoint in the vertical predictions, undefined without a prediction
 */
export function isPredictedCruiseWaypoint(
  planIndex: FlightPlanIndex,
  isAltnWaypoint: boolean,
  profilePhase: ProfilePhase | undefined,
): boolean {
  return !isAltnWaypoint && planIndex === FlightPlanIndex.Active && profilePhase === ProfilePhase.Cruise;
}

/** The VERT REV panel the altitude prediction of a waypoint opens: STEP ALTs for a cruise waypoint, else ALT */
export function altitudePredictionPanel(isCruiseWaypoint: boolean): 'step-alts' | 'alt' {
  return isCruiseWaypoint ? 'step-alts' : 'alt';
}
