// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import { PseudoWaypoints } from './PseudoWaypoints';

const checkpoint = (reason: VerticalCheckpointReason, distanceFromStart: number, secondsFromPresent: number) => ({
  reason,
  distanceFromStart,
  secondsFromPresent,
  altitude: 12_000 - distanceFromStart * 10,
  remainingFuelOnBoard: 20_000,
  speed: 250,
  mach: 0.5,
  profilePhase: 0,
});

function createPseudoWaypoints(aircraftConfig: typeof A320AircraftConfig, ndCheckpoints: any[], timeMarkers?: any) {
  const mcduCheckpoints = [
    checkpoint(VerticalCheckpointReason.PresentPosition, 0, 0),
    checkpoint(VerticalCheckpointReason.Landing, 100, 1200),
  ];
  const mcduProfile = {
    isReadyToDisplay: true,
    checkpoints: mcduCheckpoints,
    totalFlightPlanDistance: 100,
    distanceToPresentPosition: 0,
    winds: { getWindForecast: () => ({ direction: 0, magnitude: 0 }) },
    interpolateDistanceAtTime: (seconds: number) => seconds / 12,
    interpolateEverythingFromStart: (distance: number) =>
      checkpoint(VerticalCheckpointReason.AtmosphericConditions, distance, distance * 12),
  };
  const guidanceController: any = {
    activeLegIndex: 0,
    currentPseudoWaypoints: [],
    activeGeometry: { legs: new Map([[0, {}]]) },
    timeMarkers,
    efisStateForSide: { L: { mode: 0, range: 10 }, R: { mode: 0, range: 10 } },
    vnavDriver: {
      mcduProfile,
      ndProfile: { isReadyToDisplay: true, checkpoints: ndCheckpoints },
      isLatAutoControlActive: () => true,
      isLatAutoControlArmedWithIntercept: () => false,
      isFlightPhasePreflight: () => false,
      findNextSpeedChange: () => NaN,
    },
  };
  const flightPlanService: any = { hasActive: true, active: { firstMissedApproachLegIndex: 1 } };
  const atmosphericConditions: any = { casOrMach: (cas: number) => cas };
  const pseudoWaypoints = new PseudoWaypoints(
    flightPlanService,
    guidanceController,
    atmosphericConditions,
    aircraftConfig,
  );
  vi.spyOn(pseudoWaypoints as any, 'pointFromEndOfPath').mockImplementation(
    (_geometry: unknown, _count: unknown, fromEnd: number) => [{ lat: 1, long: fromEnd }, fromEnd, 0],
  );

  return pseudoWaypoints;
}

describe('pseudo waypoints of the F-PLN page', () => {
  beforeEach(() => {
    vi.stubGlobal('Simplane', { getAutoPilotAirspeedManaged: () => true });
  });

  it('A320: the descent profile intercept point (I/P) is on the F-PLN page with its predictions', () => {
    const pseudoWaypoints = createPseudoWaypoints(A320AircraftConfig, [
      checkpoint(VerticalCheckpointReason.InterceptDescentProfileManaged, 40, 480),
    ]);

    pseudoWaypoints.acceptVerticalProfile();

    const intercept = pseudoWaypoints.pseudoWaypoints.find((it) => it.ident === 'Intercept point 2');
    expect(intercept?.displayedOnMcdu).toBe(true);
    expect(intercept?.mcduIdent).toBe('(I/P)');
    expect(intercept?.flightPlanInfo?.secondsFromPresent).toBe(480);
    expect(intercept?.flightPlanInfo?.altitude).toBe(11_600);
  });

  it('A380: the intercept point stays on the ND only', () => {
    const pseudoWaypoints = createPseudoWaypoints(A380AircraftConfig, [
      checkpoint(VerticalCheckpointReason.InterceptDescentProfileSelected, 40, 480),
    ]);

    pseudoWaypoints.acceptVerticalProfile();

    const intercept = pseudoWaypoints.pseudoWaypoints.find((it) => it.ident === 'Intercept point 1');
    expect(intercept?.displayedOnMcdu).toBe(false);
    expect(intercept?.displayedOnNd).toBe(true);
  });

  it('A380: a time marker is a pseudo waypoint of the F-PLN page and the ND where the aircraft is at that time', () => {
    const timeMarkers = {
      predictions: () => [
        { utcSeconds: 10 * 3600 + 45 * 60, secondsFromPresent: 600 },
        { utcSeconds: 11 * 3600, secondsFromPresent: 5000 },
      ],
    };
    const pseudoWaypoints = createPseudoWaypoints(A380AircraftConfig, [], timeMarkers);

    pseudoWaypoints.acceptVerticalProfile();

    const markers = pseudoWaypoints.pseudoWaypoints.filter((it) => it.ident.startsWith('(1'));
    expect(markers.map((it) => it.ident)).toEqual(['(1045)']);
    expect(markers[0].displayedOnMcdu).toBe(true);
    expect(markers[0].displayedOnNd).toBe(true);
    expect(markers[0].distanceFromStart).toBe(50);
    expect(markers[0].flightPlanInfo?.secondsFromPresent).toBe(600);
  });

  it('without time markers (A320) there are none', () => {
    const pseudoWaypoints = createPseudoWaypoints(A320AircraftConfig, []);

    pseudoWaypoints.acceptVerticalProfile();

    expect(pseudoWaypoints.pseudoWaypoints.length).toBe(0);
  });

  it('a time marker defined after the last recompute shows at the next update, without a new profile', () => {
    let utcSeconds: number | null = null;
    const timeMarkers = {
      predictions: () => (utcSeconds === null ? [] : [{ utcSeconds, secondsFromPresent: 600 }]),
    };
    const pseudoWaypoints = createPseudoWaypoints(A380AircraftConfig, [], timeMarkers);
    pseudoWaypoints.acceptVerticalProfile();
    pseudoWaypoints.update(0);

    utcSeconds = 10 * 3600;
    pseudoWaypoints.update(0);

    expect(pseudoWaypoints.pseudoWaypoints.map((it) => it.ident)).toContain('(1000)');
  });
});
