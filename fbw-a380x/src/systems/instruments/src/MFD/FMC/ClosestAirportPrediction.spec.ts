// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import { Predictions } from '@fmgc/guidance/vnav/Predictions';
import {
  closestAirportPrediction,
  ClosestAirportPredictionInput,
  idleDescentToAirport,
} from './ClosestAirportPrediction';

/** FL370 cruise at 300 t ZFW and 60 t of fuel, ISA, no wind */
const input: ClosestAirportPredictionInput = {
  cruiseAltitude: 37_000,
  airportElevation: 0,
  distance: 400,
  cruiseCas: 270,
  cruiseMach: 0.85,
  descentCas: 300,
  descentMach: 0.86,
  zeroFuelWeight: 661_387,
  fuelOnBoard: 132_277,
  headwind: 0,
  isaDeviation: 0,
  tropopause: 36_089,
};

/** Comparison baseline: the whole distance flown level at the CRZ FL */
function levelOnly(distance: number) {
  return Predictions.levelFlightStep(
    A380AircraftConfig,
    input.cruiseAltitude,
    distance,
    input.cruiseCas,
    input.cruiseMach,
    input.zeroFuelWeight,
    input.fuelOnBoard,
    input.headwind,
    input.isaDeviation,
    input.tropopause,
  );
}

describe('CLOSEST AIRPORTS time and EFOB: cruise at the CRZ FL, then a continuous descent', () => {
  it('descends from FL370 to sea level over about 3 NM per 1000 ft', () => {
    const descent = idleDescentToAirport(A380AircraftConfig, input, input.fuelOnBoard);
    expect(descent.distance).toBeGreaterThan(90);
    expect(descent.distance).toBeLessThan(160);
    // an idle descent of about 20 to 30 min burning far less than the cruise
    expect(descent.seconds / 60).toBeGreaterThan(15);
    expect(descent.seconds / 60).toBeLessThan(35);
  });

  it('splits the distance into the cruise and the descent', () => {
    const result = closestAirportPrediction(A380AircraftConfig, input);
    expect(result.cruiseDistance + result.descentDistance).toBeCloseTo(400, 0);
    expect(result.cruiseDistance).toBeGreaterThan(200);
  });

  it('burns less fuel than the whole distance flown level at the CRZ FL (the idle descent)', () => {
    const result = closestAirportPrediction(A380AircraftConfig, input);
    const level = levelOnly(400);
    expect(result.fuelBurned).toBeLessThan(level.fuelBurned * 0.9);
    expect(result.fuelBurned).toBeGreaterThan(level.fuelBurned * 0.5);
  });

  it('has a shorter descent to a high airport', () => {
    const high = idleDescentToAirport(A380AircraftConfig, { ...input, airportElevation: 8_000 }, input.fuelOnBoard);
    const low = idleDescentToAirport(A380AircraftConfig, input, input.fuelOnBoard);
    expect(high.distance).toBeLessThan(low.distance);
  });

  it('gives an airport closer than the descent distance its share of the descent', () => {
    const descent = idleDescentToAirport(A380AircraftConfig, input, input.fuelOnBoard);
    const result = closestAirportPrediction(A380AircraftConfig, { ...input, distance: descent.distance / 2 });
    expect(result.cruiseDistance).toBe(0);
    expect(result.descentDistance).toBeCloseTo(descent.distance / 2, 1);
    expect(result.seconds).toBeCloseTo(descent.seconds / 2, 0);
  });
});
