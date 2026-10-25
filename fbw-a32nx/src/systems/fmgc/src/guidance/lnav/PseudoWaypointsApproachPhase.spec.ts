// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import { PseudoWaypointSequencingAction } from '@fmgc/guidance/PseudoWaypoint';
import { LateralMode } from '@shared/autopilot';
import { PseudoWaypoints } from './PseudoWaypoints';

const DESTINATION_ELEVATION = 1_000;

/** Sequences the DECEL point with the given lateral mode and altitude; returns whether the approach phase was requested */
function decelRequestsApproachPhase(
  aircraftConfig: typeof A320AircraftConfig,
  lateralMode: LateralMode,
  altitude: number,
): boolean {
  const written: [string, unknown][] = [];
  vi.stubGlobal('SimVar', {
    GetSimVarValue: (name: string) => {
      if (name === 'L:A32NX_FMA_LATERAL_MODE') {
        return lateralMode;
      }
      if (name === 'INDICATED ALTITUDE') {
        return altitude;
      }
      return 0;
    },
    SetSimVarValue: (name: string, _unit: string, value: unknown) => {
      written.push([name, value]);
      return Promise.resolve();
    },
  });
  const flightPlanService: any = {
    hasActive: true,
    active: { destinationAirport: { location: { lat: 0, long: 0, alt: DESTINATION_ELEVATION } } },
  };
  const pseudoWaypoints = new PseudoWaypoints(flightPlanService, {} as any, {} as any, aircraftConfig);

  pseudoWaypoints.sequencePseudoWaypoint({
    sequencingType: PseudoWaypointSequencingAction.APPROACH_PHASE_AUTO_ENGAGE,
  } as any);

  return written.some(([name, value]) => name === 'L:A32NX_FM_ENABLE_APPROACH_PHASE' && value === true);
}

describe('approach phase request when the DECEL point is sequenced', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('A320: requested with NAV below 9500 ft above the destination', () => {
    expect(decelRequestsApproachPhase(A320AircraftConfig, LateralMode.NAV, DESTINATION_ELEVATION + 3_000)).toBe(true);
  });

  it('A320: not requested at 9500 ft or more above the destination', () => {
    expect(decelRequestsApproachPhase(A320AircraftConfig, LateralMode.NAV, DESTINATION_ELEVATION + 9_600)).toBe(false);
  });

  it('A320: not requested in a selected lateral mode', () => {
    expect(decelRequestsApproachPhase(A320AircraftConfig, LateralMode.HDG, DESTINATION_ELEVATION + 3_000)).toBe(false);
  });

  it('A380: requested with NAV below 7200 ft above the destination', () => {
    expect(decelRequestsApproachPhase(A380AircraftConfig, LateralMode.NAV, DESTINATION_ELEVATION + 3_000)).toBe(true);
  });
});
