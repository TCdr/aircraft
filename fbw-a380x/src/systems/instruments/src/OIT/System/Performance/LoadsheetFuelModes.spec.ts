// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { TRIM_TANK_INDEX } from './Loadsheet';
import { tankCapacities } from './LoadsheetFuel';
import { weightToDisplayUnit } from './PerformanceEntries';
import { manualDistribution, manualDistributionMatchesFob, trimAdjustmentDistribution } from './LoadsheetFuelModes';

const DENSITY = 0.785;
const CAPACITIES = tankCapacities(DENSITY);
const sum = (values: readonly number[]) => values.reduce((total, v) => total + v, 0);

describe('LOADSHEET fuel modes', () => {
  it('puts the trim quantity of the crew in the trim tank and the rest in the wings', () => {
    const distribution = trimAdjustmentDistribution(150_000, 12_000, DENSITY);
    expect(distribution[TRIM_TANK_INDEX]).toBe(12_000);
    expect(sum(distribution)).toBeCloseTo(150_000, 3);
  });

  it('keeps the trim quantity within the trim tank capacity and within the FOB', () => {
    expect(trimAdjustmentDistribution(150_000, 99_000, DENSITY)[TRIM_TANK_INDEX]).toBeCloseTo(
      CAPACITIES[TRIM_TANK_INDEX],
      3,
    );
    expect(trimAdjustmentDistribution(5_000, 9_000, DENSITY)[TRIM_TANK_INDEX]).toBeCloseTo(5_000, 3);
  });

  it('moves fuel to the trim tank when the wings cannot hold the FOB', () => {
    const wingCapacity = sum(CAPACITIES) - CAPACITIES[TRIM_TANK_INDEX];
    const distribution = trimAdjustmentDistribution(wingCapacity + 3_000, 0, DENSITY);
    expect(distribution[TRIM_TANK_INDEX]).toBeCloseTo(3_000, 3);
  });

  it('takes the tank fields of the crew as they are, an empty field being an empty tank', () => {
    const entries = CAPACITIES.map(() => null as number | null);
    entries[1] = 5_000;
    entries[TRIM_TANK_INDEX] = 1e9;
    const distribution = manualDistribution(entries, DENSITY);
    expect(distribution[1]).toBe(5_000);
    expect(distribution[0]).toBe(0);
    expect(distribution[TRIM_TANK_INDEX]).toBeCloseTo(CAPACITIES[TRIM_TANK_INDEX], 3);
  });

  it('accepts a manual distribution only when the tanks add up to the FOB', () => {
    const distribution = manualDistribution(
      CAPACITIES.map(() => 1_000),
      DENSITY,
    );
    expect(manualDistributionMatchesFob(distribution, 11_000)).toBe(true);
    expect(manualDistributionMatchesFob(distribution, 11_005)).toBe(false);
  });

  it.each([true, false])('accepts the displayed value of every tank typed back (metric %s)', (metric) => {
    const fob = 150_000;
    const raw = CAPACITIES.map((cap) => cap * 0.5123456);
    const exact = raw.map((kg) => (kg * fob) / sum(raw));
    const typedKg = exact.map((kg) => {
      const shown = Math.round(weightToDisplayUnit(kg, metric) * 10) / 10;
      return metric ? shown * 1000 : shown * 1000 * 0.45359237;
    });
    const entries: (number | null)[] = [...typedKg];
    expect(manualDistributionMatchesFob(manualDistribution(entries, DENSITY, exact, metric), fob)).toBe(true);
    entries[0] = typedKg[0] + 1_000;
    expect(manualDistributionMatchesFob(manualDistribution(entries, DENSITY, exact, metric), fob)).toBe(false);
  });
});
