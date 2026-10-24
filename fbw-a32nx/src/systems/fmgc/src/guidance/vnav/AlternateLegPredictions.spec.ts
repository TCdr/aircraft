// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import { ProfilePhase } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { AlternateFuelPredictor } from './AlternateFuelPredictor';
import {
  alternateLegDistances,
  alternateLegPredictions,
  alternatePlanDistance,
  alternateRouteDistance,
  UNKNOWN_ALTERNATE_START,
} from './AlternateLegPredictions';

const TONNE_TO_LB = 2204.62;

const prediction = AlternateFuelPredictor.predict(A380AircraftConfig, {
  distance: 300,
  destinationElevation: 14,
  alternateElevation: 92,
  zeroFuelWeight: 344 * TONNE_TO_LB,
  fuelOnBoard: 12.5 * TONNE_TO_LB,
})!;

const start = { secondsFromPresent: 3600, estimatedFuelOnBoard: 20 * TONNE_TO_LB, distanceFromStart: 1000 };
const legs = [
  { legIndex: 1, distance: 10 },
  { legIndex: 2, distance: 150 },
  { legIndex: 3, distance: 300 },
];

describe('alternateLegPredictions', () => {
  const predictions = alternateLegPredictions(prediction, legs, start, { fuel: null, time: null }, 36_090, 0);

  it('counts the time and the distance from the primary destination', () => {
    const times = legs.map((leg) => predictions.get(leg.legIndex)!.secondsFromPresent);
    expect(times[0]).toBeGreaterThan(3600);
    expect(times[0]).toBeLessThan(times[1]);
    expect(times[1]).toBeLessThan(times[2]);
    expect(times[2]).toBeCloseTo(3600 + prediction.time, 3);
    expect(predictions.get(2)!.distanceFromStart).toBe(1150);
  });

  it('burns the fuel of the profile from the EFOB at the destination', () => {
    const efob = legs.map((leg) => predictions.get(leg.legIndex)!.estimatedFuelOnBoard);
    expect(efob[0]).toBeLessThan(start.estimatedFuelOnBoard);
    expect(efob[1]).toBeGreaterThan(efob[2]);
    expect(efob[2]).toBeCloseTo(start.estimatedFuelOnBoard - prediction.fuel, 3);
  });

  it('gives the altitude and the phase of the profile, level at the cruise level in the middle', () => {
    expect(predictions.get(1)!.altitude).toBeGreaterThan(14);
    expect(predictions.get(1)!.profilePhase).toBe(ProfilePhase.Climb);
    expect(predictions.get(2)!.altitude).toBe(prediction.cruiseAltitude);
    expect(predictions.get(2)!.profilePhase).toBe(ProfilePhase.Cruise);
    expect(predictions.get(3)!.altitude).toBeLessThan(2500);
  });

  it('shows the approach speed on the legs at the primary destination and at the alternate', () => {
    const withVapp = AlternateFuelPredictor.predict(A380AircraftConfig, {
      distance: 300,
      destinationElevation: 14,
      alternateElevation: 92,
      zeroFuelWeight: 344 * TONNE_TO_LB,
      fuelOnBoard: 12.5 * TONNE_TO_LB,
      approachSpeed: 142,
    })!;
    const atAirports = alternateLegPredictions(
      withVapp,
      [
        { legIndex: 0, distance: 0 },
        { legIndex: 3, distance: 300 },
      ],
      start,
      { fuel: null, time: null },
      36_090,
      0,
    );
    expect(atAirports.get(0)!.speed).toBe(142);
    expect(atAirports.get(3)!.speed).toBe(142);
  });

  it('keeps the altitude and the speed when the primary flight plan has no predictions yet', () => {
    const unknown = alternateLegPredictions(
      prediction,
      legs,
      UNKNOWN_ALTERNATE_START,
      { fuel: null, time: null },
      36_090,
      0,
    );
    expect(unknown.get(2)!.altitude).toBe(prediction.cruiseAltitude);
    expect(unknown.get(2)!.speed).toBeGreaterThan(0);
    expect(Number.isFinite(unknown.get(2)!.secondsFromPresent)).toBe(false);
    expect(Number.isFinite(unknown.get(2)!.estimatedFuelOnBoard)).toBe(false);
  });

  it('scales the profile to the ALTN fuel and time of the FUEL pages', () => {
    const scaled = alternateLegPredictions(prediction, legs, start, { fuel: 8 * TONNE_TO_LB, time: 3000 }, 36_090, 0);
    expect(scaled.get(3)!.estimatedFuelOnBoard).toBeCloseTo(start.estimatedFuelOnBoard - 8 * TONNE_TO_LB, 3);
    expect(scaled.get(3)!.secondsFromPresent).toBeCloseTo(3600 + 3000, 3);
  });
});

describe('alternate flight plan distance', () => {
  const plan = (cumulative: Array<number | 'discontinuity' | undefined>) => ({
    firstMissedApproachLegIndex: cumulative.length,
    maybeElementAt: (i: number) =>
      cumulative[i] === 'discontinuity'
        ? { isDiscontinuity: true }
        : {
            isDiscontinuity: false,
            calculated:
              cumulative[i] === undefined ? undefined : { cumulativeDistanceWithTransitions: cumulative[i] as number },
          },
  });

  it('takes the computed legs with their cumulative distance', () => {
    const alternate = plan([0, 12, 'discontinuity', undefined, 40]) as never;
    expect(alternateLegDistances(alternate)).toEqual([
      { legIndex: 0, distance: 0 },
      { legIndex: 1, distance: 12 },
      { legIndex: 4, distance: 40 },
    ]);
    expect(alternateRouteDistance(alternate)).toBe(40);
    expect(alternateRouteDistance(plan([undefined]) as never)).toBeNull();
  });

  it('uses the direct distance for a route out of proportion with it', () => {
    expect(alternatePlanDistance(100, 130)).toBe(130);
    expect(alternatePlanDistance(100, null)).toBe(100);
    expect(alternatePlanDistance(100, 500)).toBe(100);
  });
});
