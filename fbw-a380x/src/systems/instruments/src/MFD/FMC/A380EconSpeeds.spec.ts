// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { CostIndexMode } from '@fmgc/flightplanning/plans/performance/FlightPlanPerformanceData';
import {
  a380EconSpeeds,
  A380EconSpeedCache,
  A380EconSpeedData,
  a380OptimumFlightLevel,
  A380OptimumLevelCache,
  A380OptimumLevelData,
  DescentEconSpeedFreeze,
} from './A380EconSpeeds';
import { longRangeCruiseMach } from './CruiseSpeeds';

const econData = (overrides: Partial<A380EconSpeedData> = {}): A380EconSpeedData => ({
  costIndex: 60,
  costIndexMode: CostIndexMode.ECON,
  cruiseFlightLevel: 350,
  grossWeight: 450,
  descentWeight: 330,
  isaDeviation: 0,
  cruiseHeadwind: 0,
  tropopause: 36_090,
  ...overrides,
});

const levelData = (overrides: Partial<A380OptimumLevelData> = {}): A380OptimumLevelData => ({
  costIndex: 60,
  grossWeight: 450,
  recMaxFlightLevel: 410,
  engineOut: false,
  isaDeviation: 0,
  headwind: 0,
  tropopause: 36_090,
  distanceToDestination: null,
  distanceToTopOfDescent: null,
  currentAltitude: 0,
  destinationElevation: 0,
  ...overrides,
});

describe('A380 ECON speeds', () => {
  it('replace the fixed 310 kt / M.85 cruise target with the cost index model', () => {
    const ci0 = a380EconSpeeds(econData({ costIndex: 0 }))!;
    const ci60 = a380EconSpeeds(econData())!;
    const ci300 = a380EconSpeeds(econData({ costIndex: 300 }))!;

    expect(ci0.cruiseMach).toBeLessThan(ci60.cruiseMach);
    expect(ci60.cruiseMach).toBeLessThan(ci300.cruiseMach);
    expect(ci0.cruiseMach).toBeGreaterThanOrEqual(0.8);
    expect(ci300.cruiseMach).toBeLessThanOrEqual(0.87);
    expect(ci0.descentSpeed).toBeLessThan(ci300.descentSpeed);
    expect(ci300.climbSpeed).toBeLessThanOrEqual(330);
  });

  it('flies the LRC Mach in cruise in LRC mode', () => {
    const lrc = a380EconSpeeds(econData({ costIndexMode: CostIndexMode.LRC }))!;
    expect(lrc.cruiseMach).toBe(longRangeCruiseMach(450_000, 35_000));
    // with the entered tropopause
    const lowTropopause = a380EconSpeeds(econData({ costIndexMode: CostIndexMode.LRC, tropopause: 30_000 }))!;
    expect(lowTropopause.cruiseMach).toBe(longRangeCruiseMach(450_000, 35_000, 0, 30_000));
  });

  it('cannot compute without cost index, cruise level or gross weight', () => {
    expect(a380EconSpeeds(econData({ costIndex: null }))).toBeNull();
    expect(a380EconSpeeds(econData({ cruiseFlightLevel: null }))).toBeNull();
    expect(a380EconSpeeds(econData({ grossWeight: null }))).toBeNull();
  });

  it('recomputes only when a rounded input changes', () => {
    const cache = new A380EconSpeedCache();
    const first = cache.get(econData());
    expect(cache.get(econData({ grossWeight: 450.2 }))).toBe(first);
    expect(cache.get(econData({ costIndex: 200 }))).not.toBe(first);
  });
});

describe('A380 LRC Mach', () => {
  it('is near M.83 to M.85 at mid weights and higher when heavier', () => {
    const mid = longRangeCruiseMach(450_000, 35_000)!;
    expect(mid).toBeGreaterThanOrEqual(0.82);
    expect(mid).toBeLessThanOrEqual(0.86);
    expect(longRangeCruiseMach(550_000, 35_000)!).toBeGreaterThan(longRangeCruiseMach(350_000, 35_000)!);
  });
});

describe('A380 OPT FL', () => {
  it('replaces 0.96 x REC MAX with the most economic level, lower when heavier, not above the REC MAX', () => {
    const mid = a380OptimumFlightLevel(levelData())!;
    const heavy = a380OptimumFlightLevel(levelData({ grossWeight: 560, recMaxFlightLevel: 370 }))!;
    expect(mid).toBeGreaterThanOrEqual(360);
    expect(mid).toBeLessThanOrEqual(410);
    expect(heavy).toBeLessThan(mid);
    expect(a380OptimumFlightLevel(levelData({ grossWeight: 300, recMaxFlightLevel: 403 }))).toBe(400);
  });

  it('needs 15 min of cruise at that level', () => {
    // 300 NM: 5 + 3.3 NM per 1000 ft and about 110 NM of cruise leave about FL230
    const level = a380OptimumFlightLevel(levelData({ distanceToDestination: 300 }))!;
    expect(level).toBeLessThanOrEqual(240);
    expect(level).toBeGreaterThanOrEqual(200);
  });

  it('is computed until 15 NM before the T/D', () => {
    expect(a380OptimumFlightLevel(levelData({ distanceToTopOfDescent: 16 }))).not.toBeNull();
    expect(a380OptimumFlightLevel(levelData({ distanceToTopOfDescent: 14 }))).toBeNull();
    expect(a380OptimumFlightLevel(levelData({ distanceToTopOfDescent: -5 }))).toBeNull();
  });

  it('shows dashes with an engine out or without cost index, gross weight or REC MAX', () => {
    expect(a380OptimumFlightLevel(levelData({ engineOut: true }))).toBeNull();
    expect(a380OptimumFlightLevel(levelData({ costIndex: null }))).toBeNull();
    expect(a380OptimumFlightLevel(levelData({ grossWeight: null }))).toBeNull();
    expect(a380OptimumFlightLevel(levelData({ recMaxFlightLevel: null }))).toBeNull();
  });
});

describe('A380 ECON speeds in descent', () => {
  it('stay the last ones computed before the descent', () => {
    const freeze = new DescentEconSpeedFreeze();
    const cruise = a380EconSpeeds(econData({ isaDeviation: 10, cruiseHeadwind: 80 }));
    // In descent the cruise temperature and wind are no longer measured: a new computation would differ
    const descent = a380EconSpeeds(econData());
    expect(descent).not.toEqual(cruise);

    expect(freeze.get(false, () => cruise)).toBe(cruise);
    expect(freeze.get(true, () => descent)).toBe(cruise);
    expect(freeze.get(true, () => descent)).toBe(cruise);
    // Back to a climb (go-around): computed again
    expect(freeze.get(false, () => descent)).toBe(descent);
  });

  it('are computed in descent when none was computed before it', () => {
    const freeze = new DescentEconSpeedFreeze();
    const descent = a380EconSpeeds(econData());
    expect(freeze.get(true, () => descent)).toBe(descent);
  });
});

describe('A380 OPT FL cache', () => {
  it('searches again only when a rounded input changes', () => {
    const cache = new A380OptimumLevelCache();
    const first = cache.get(levelData());
    expect(cache.get(levelData({ grossWeight: 450.3 }))).toBe(first);
    expect(cache.get(levelData({ distanceToTopOfDescent: 10 }))).toBeNull();
  });
});
