// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  progOptimumFlightLevel,
  ProgOptimumFlightLevelCache,
  ProgOptimumFlightLevelInputs,
  progOptimumFlightLevelWeightsEntered,
} from './OptimumFlightLevel';

const inputs = (overrides: Partial<ProgOptimumFlightLevelInputs> = {}): ProgOptimumFlightLevelInputs => ({
  grossWeight: 70,
  recMaxFlightLevel: 383,
  engineOut: false,
  costIndex: 30,
  isaDeviation: 0,
  headwind: 0,
  tropopause: 36_090,
  distanceToDestination: null,
  currentAltitude: 0,
  destinationElevation: 0,
  ...overrides,
});

describe('PROG page OPT FL', () => {
  it('is the economic level for the cost index and weight, close to the best level of the LRC table', () => {
    // LRC cruise table, ISA: 70 t -> FL371, 74 t -> FL360
    expect(progOptimumFlightLevel(inputs())).toBe(370);
    const heavy = progOptimumFlightLevel(inputs({ grossWeight: 74, recMaxFlightLevel: 375 }))!;
    expect(Math.abs(heavy - 360)).toBeLessThanOrEqual(10);
  });

  it('is not above the REC MAX, rounded down to a multiple of 5', () => {
    expect(progOptimumFlightLevel(inputs({ grossWeight: 58, recMaxFlightLevel: 398 }))).toBe(395);
  });

  it('depends on the cost index', () => {
    const levels = [0, 30, 100].map((costIndex) => progOptimumFlightLevel(inputs({ grossWeight: 66, costIndex })));
    expect(new Set(levels).size).toBeGreaterThan(1);
  });

  it('leaves at least 5 min of cruise on a short trip', () => {
    expect(progOptimumFlightLevel(inputs({ distanceToDestination: 150 }))!).toBeLessThanOrEqual(170);
  });

  it('shows dashes with an engine out or without gross weight, REC MAX or cost index', () => {
    expect(progOptimumFlightLevel(inputs({ engineOut: true }))).toBeNull();
    expect(progOptimumFlightLevel(inputs({ grossWeight: null }))).toBeNull();
    expect(progOptimumFlightLevel(inputs({ recMaxFlightLevel: null }))).toBeNull();
    expect(progOptimumFlightLevel(inputs({ costIndex: null }))).toBeNull();
  });
});

describe('PROG page OPT FL weight entries', () => {
  it('needs the BLOCK fuel only before engine start', () => {
    expect(
      progOptimumFlightLevelWeightsEntered({ zeroFuelWeightCenterOfGravity: 32.3, blockFuel: null, anEngineOn: false }),
    ).toBe(false);
    expect(
      progOptimumFlightLevelWeightsEntered({ zeroFuelWeightCenterOfGravity: 32.3, blockFuel: 9.5, anEngineOn: false }),
    ).toBe(true);
  });

  it('is shown in cruise when ZFW/ZFWCG were entered on FUEL PRED with the engines running (no BLOCK entry)', () => {
    expect(
      progOptimumFlightLevelWeightsEntered({ zeroFuelWeightCenterOfGravity: 32.3, blockFuel: null, anEngineOn: true }),
    ).toBe(true);
    // CYUL-CYVR at FL340: GW 64.9 t, CI 10, REC MAX FL398, 828 NM to go
    expect(
      progOptimumFlightLevel(
        inputs({
          grossWeight: 64.9,
          recMaxFlightLevel: 398,
          costIndex: 10,
          distanceToDestination: 828,
          currentAltitude: 34_000,
          destinationElevation: 14,
        }),
      ),
    ).toBe(380);
  });

  it('shows dashes without the ZFWCG', () => {
    expect(
      progOptimumFlightLevelWeightsEntered({ zeroFuelWeightCenterOfGravity: null, blockFuel: 9.5, anEngineOn: true }),
    ).toBe(false);
  });
});

describe('PROG page OPT FL cache', () => {
  it('searches again only when a rounded input changes', () => {
    const cache = new ProgOptimumFlightLevelCache();
    expect(cache.get(inputs({ grossWeight: 70.2 }))).toBe(370);
    expect(cache.get(inputs({ grossWeight: 70.1 }))).toBe(370);
    expect(cache.get(inputs({ engineOut: true }))).toBeNull();
  });
});
