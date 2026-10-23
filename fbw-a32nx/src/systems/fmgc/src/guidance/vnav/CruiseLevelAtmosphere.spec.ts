// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320AircraftConfig, A320EconParameters } from '@fmgc/flightplanning/A320AircraftConfig';
import { PropagationType, createVectorFromMagnitudeAndDirection } from '@fmgc/flightplanning/data/wind';
import { createLevelAtmosphere, CruiseLevelAtmosphereInputs } from './CruiseLevelAtmosphere';
import { blendCruiseIsaDeviation } from './temperature/TemperatureProfile';
import { EconSpeeds } from './EconSpeeds';

const eastbound = (overrides: Partial<CruiseLevelAtmosphereInputs['legs'][0]> = {}) => ({
  distance: 500,
  trueTrack: 90,
  winds: [
    {
      altitude: 40_000,
      vector: createVectorFromMagnitudeAndDirection(20, 270),
      type: PropagationType.Entry,
      sourceLegIndex: 1,
    },
    {
      altitude: 30_000,
      vector: createVectorFromMagnitudeAndDirection(100, 270),
      type: PropagationType.Entry,
      sourceLegIndex: 1,
    },
  ],
  isaDeviation: null,
  ...overrides,
});

const inputs = (overrides: Partial<CruiseLevelAtmosphereInputs> = {}): CruiseLevelAtmosphereInputs => ({
  legs: [eastbound()],
  tripWind: null,
  planIsaDeviation: null,
  measured: null,
  ...overrides,
});

describe('the wind and temperature of the route per level', () => {
  it('takes the entered wind of each level, interpolated between the entered levels', () => {
    const atmosphere = createLevelAtmosphere(inputs());

    expect(atmosphere.at(30_000).headwind).toBeCloseTo(-100, 0);
    expect(atmosphere.at(35_000).headwind).toBeCloseTo(-60, 0);
    expect(atmosphere.at(40_000).headwind).toBeCloseTo(-20, 0);
  });

  it('uses the trip wind without cruise winds, and no wind without that', () => {
    expect(createLevelAtmosphere(inputs({ legs: [eastbound({ winds: [] })], tripWind: 30 })).at(35_000).headwind).toBe(
      -30,
    );
    expect(createLevelAtmosphere(inputs({ legs: [eastbound({ winds: [] })] })).at(35_000).headwind).toBeCloseTo(0);
  });

  it('weights the legs by their distance', () => {
    const westbound = eastbound({ distance: 500, trueTrack: 270 });
    const atmosphere = createLevelAtmosphere(inputs({ legs: [eastbound(), westbound] }));

    expect(atmosphere.at(30_000).headwind).toBeCloseTo(0);
  });

  it('takes the SAT of the waypoints, else the CRZ TEMP of the plan, else the ISA', () => {
    expect(createLevelAtmosphere(inputs({ legs: [eastbound({ isaDeviation: 8 })] })).at(35_000).isaDeviation).toBe(8);
    expect(createLevelAtmosphere(inputs({ planIsaDeviation: -5 })).at(35_000).isaDeviation).toBe(-5);
    expect(createLevelAtmosphere(inputs()).at(35_000).isaDeviation).toBe(0);
  });

  it('uses the measurement at the aircraft level and the entries 10 000 ft away', () => {
    const calm = createVectorFromMagnitudeAndDirection(0, 0);
    const atmosphere = createLevelAtmosphere(
      inputs({ measured: { altitude: 30_000, wind: calm, isaDeviation: 12 }, planIsaDeviation: 0 }),
    );

    expect(atmosphere.at(30_000)).toMatchObject({ isaDeviation: 12 });
    expect(atmosphere.at(30_000).headwind).toBeCloseTo(0);
    expect(atmosphere.at(40_000)).toMatchObject({ isaDeviation: 0 });
    expect(atmosphere.at(40_000).headwind).toBeCloseTo(-20, 0);
    expect(atmosphere.at(35_000).isaDeviation).toBeCloseTo(6);
  });

  it('uses the measured temperature at every level when no SAT is entered', () => {
    const atmosphere = createLevelAtmosphere(
      inputs({ measured: { altitude: 30_000, wind: createVectorFromMagnitudeAndDirection(0, 0), isaDeviation: 7 } }),
    );

    expect(atmosphere.at(40_000).isaDeviation).toBe(7);
  });

  it('changes its key when an entered wind or SAT changes', () => {
    const base = createLevelAtmosphere(inputs()).key;

    expect(createLevelAtmosphere(inputs({ legs: [eastbound({ isaDeviation: 8 })] })).key).not.toBe(base);
    expect(createLevelAtmosphere(inputs({ tripWind: 20 })).key).not.toBe(base);
  });
});

describe('the cruise prediction temperature', () => {
  it('is the measured one without entries', () => {
    expect(blendCruiseIsaDeviation(null, 5, 300, 0)).toBe(5);
  });

  it('fades from the measurement at the aircraft into the entries 200 NM or 10 000 ft away', () => {
    expect(blendCruiseIsaDeviation(-10, 10, 0, 0)).toBe(10);
    expect(blendCruiseIsaDeviation(-10, 10, 100, 0)).toBe(0);
    expect(blendCruiseIsaDeviation(-10, 10, 250, 0)).toBe(-10);
    expect(blendCruiseIsaDeviation(-10, 10, 0, 10_000)).toBe(-10);
  });
});

describe('the optimum flight level with the wind per level', () => {
  const weight = (65 * 1000) / 0.45359237;
  const conditions = { altitude: 0, weight, isaDeviation: 0, headwind: 0, tropopause: 36_090 };
  const search = (atmosphereAt?: (altitude: number) => { isaDeviation: number; headwind: number }) =>
    EconSpeeds.optimumFlightLevel(
      A320AircraftConfig,
      A320EconParameters,
      30,
      conditions,
      398,
      () => 215,
      null,
      atmosphereAt,
    );

  it('moves to the level where the entered wind is best', () => {
    const noWind = search()!;
    const jetStreamAbove = search((altitude) => ({ isaDeviation: 0, headwind: altitude >= 38_000 ? -150 : 0 }))!;
    const headwindAbove = search((altitude) => ({ isaDeviation: 0, headwind: altitude >= 36_000 ? 150 : 0 }))!;

    expect(jetStreamAbove).toBeGreaterThanOrEqual(380);
    expect(headwindAbove).toBeLessThan(360);
    expect(noWind).toBeGreaterThan(headwindAbove);
  });

  it('keeps the constant conditions without a per-level atmosphere', () => {
    expect(search(undefined)).toBe(
      EconSpeeds.optimumFlightLevel(A320AircraftConfig, A320EconParameters, 30, conditions, 398, () => 215, null),
    );
  });
});
