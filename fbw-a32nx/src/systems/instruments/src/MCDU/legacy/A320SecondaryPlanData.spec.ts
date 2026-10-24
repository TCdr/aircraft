// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { ProfilePhase, VerticalWaypointPrediction } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { FmgcFlightPhase } from '@shared/flightphase';
import { FlightPlan } from '@fmgc/flightplanning/plans/FlightPlan';
import {
  missingSecondaryPlanInputs,
  secondaryPlanParameters,
} from '@fmgc/guidance/vnav/SecondaryFlightPlanPredictions';
import { VerticalProfileComputationParameters } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import {
  a320SecondaryPlanData,
  isSecondaryPredictionShown,
  secondaryManagedSpeeds,
  secondaryPredictionGate,
} from './A320SecondaryPlanData';

// The sim's LatLongAlt class
vi.stubGlobal(
  'LatLongAlt',
  class {
    constructor(
      public lat: number,
      public long: number,
      public alt: number,
    ) {}
  },
);

const situation = (overrides = {}) => ({
  copiedFromActive: true,
  activeFlightPhase: FmgcFlightPhase.Cruise,
  activeLegId: 'ABC',
  secondaryLegId: 'ABC',
  sameDepartureAirport: true,
  ...overrides,
});

describe('secondaryPredictionGate', () => {
  it('computes a copy of the active flight plan while both have the same active leg', () => {
    expect(secondaryPredictionGate(situation())).toBe('compute');
  });

  it('keeps the predictions as they are once the active legs diverge', () => {
    expect(secondaryPredictionGate(situation({ secondaryLegId: 'XYZ' }))).toBe('freeze');
  });

  it('removes the predictions of a copy once the aircraft reaches the top of descent', () => {
    expect(secondaryPredictionGate(situation({ activeFlightPhase: FmgcFlightPhase.Descent }))).toBe('clear');
    expect(secondaryPredictionGate(situation({ activeFlightPhase: FmgcFlightPhase.Approach }))).toBe('clear');
  });

  it('computes a copy before takeoff when both leave the same airport, whatever the runways and legs', () => {
    const preflight = { activeFlightPhase: FmgcFlightPhase.Preflight, secondaryLegId: 'OTHER' };
    expect(secondaryPredictionGate(situation(preflight))).toBe('compute');
    expect(secondaryPredictionGate(situation({ ...preflight, sameDepartureAirport: false }))).toBe('freeze');
  });

  it('computes a flight plan created on its INIT page whatever the aircraft does', () => {
    expect(
      secondaryPredictionGate(
        situation({ copiedFromActive: false, activeFlightPhase: FmgcFlightPhase.Descent, secondaryLegId: 'XYZ' }),
      ),
    ).toBe('compute');
  });
});

describe('isSecondaryPredictionShown', () => {
  it('hides the descent, approach and go around predictions', () => {
    const prediction = (profilePhase: ProfilePhase) => ({ profilePhase }) as VerticalWaypointPrediction;
    expect(isSecondaryPredictionShown(prediction(ProfilePhase.Climb))).toBe(true);
    expect(isSecondaryPredictionShown(prediction(ProfilePhase.Cruise))).toBe(true);
    expect(isSecondaryPredictionShown(prediction(ProfilePhase.Descent))).toBe(false);
  });
});

describe('secondaryManagedSpeeds', () => {
  const none = { speed: null, mach: null };

  it('uses the cost index tables without a cruise level or weight', () => {
    const speeds = secondaryManagedSpeeds(0, null, null, null, none);
    expect(speeds.managedClimbSpeed).toBe(290);
    expect(speeds.managedDescentSpeed).toBe(288);
    expect(secondaryManagedSpeeds(999, null, null, null, none).managedClimbSpeed).toBe(330);
  });

  it('uses the ECON speeds of the cost index, level and weight of the secondary flight plan', () => {
    const low = secondaryManagedSpeeds(0, 350, 65, null, none);
    const high = secondaryManagedSpeeds(100, 350, 65, null, none);
    expect(low.managedCruiseSpeedMach).toBeGreaterThan(0.6);
    expect(low.managedCruiseSpeedMach).toBeLessThanOrEqual(0.8);
    expect(high.managedCruiseSpeedMach).toBeGreaterThan(low.managedCruiseSpeedMach);
  });

  it('prefers the descent speed entered for the flight plan', () => {
    const speeds = secondaryManagedSpeeds(0, 350, 65, null, { speed: 270, mach: 0.75 });
    expect(speeds.managedDescentSpeed).toBe(270);
    expect(speeds.managedDescentSpeedMach).toBe(0.75);
  });
});

describe('a copy of the active flight plan on the ground before engine start', () => {
  const fakePlan = (copied: boolean, entries: Record<string, unknown>) =>
    ({
      isActiveOrCopiedFromActive: () => copied,
      performanceData: new Proxy({}, { get: (_target, key: string) => ({ get: () => entries[key] ?? null }) }),
      originAirport: { location: { lat: 45, long: -73, alt: 118 } },
      destinationAirport: { location: { lat: 49, long: -123, alt: 14 } },
    }) as unknown as FlightPlan;

  const activeEntries = { cruiseFlightLevel: 350, zeroFuelWeight: 58, fuelOnBoard: 9 };

  // The active parameters of an A320 at the gate with the approach speeds computed
  const activeParameters = {
    flightPhase: FmgcFlightPhase.Preflight,
    zeroFuelWeight: 58_000,
    fuelOnBoard: 20_000,
    cruiseAltitude: 35_000,
    departureElevation: 118,
    destinationElevation: 14,
    thrustReductionAltitude: 1500,
    accelerationAltitude: 1500,
    approachSpeed: 135,
    flapRetractionSpeed: 170,
    slatRetractionSpeed: 190,
    cleanSpeed: 210,
  } as unknown as VerticalProfileComputationParameters;

  const missingFor = (data: ReturnType<typeof a320SecondaryPlanData>) =>
    missingSecondaryPlanInputs(secondaryPlanParameters(activeParameters, data));

  it('can be computed with the entries copied from the active flight plan', () => {
    const copy = fakePlan(true, { cruiseFlightLevel: 350, zeroFuelWeight: 58, costIndex: 20 });
    expect(missingFor(a320SecondaryPlanData(copy, 9, null, activeEntries))).toEqual([]);
  });

  it('falls back on the entries of the active flight plan that the copy lacks', () => {
    const copy = fakePlan(true, {});
    const data = a320SecondaryPlanData(copy, null, null, activeEntries);
    expect(data.zeroFuelWeight).toBe(58);
    expect(data.fuelOnBoard).toBe(9);
    expect(data.cruiseAltitude).toBe(35_000);
    expect(missingFor(data)).toEqual([]);
  });

  it('does not borrow the entries of the active flight plan for a flight plan created on its INIT page', () => {
    const independent = fakePlan(false, {});
    const data = a320SecondaryPlanData(independent, null, null, activeEntries);
    expect(data.zeroFuelWeight).toBeNull();
    expect(missingFor(data)).toEqual(['ZFW', 'fuel on board', 'cruise level']);
  });
});
