// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { TRIM_TANK_INDEX } from './Loadsheet';
import { tankCapacities } from './LoadsheetFuel';
import { weightToDisplayUnit } from './PerformanceEntries';
import {
  displayedTankTotal,
  fitManualDistributionToFob,
  manualDistribution,
  manualDistributionMatchesFob,
  trimAdjustmentDistribution,
} from './LoadsheetFuelModes';

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
    expect(manualDistributionMatchesFob(distribution, 11_200)).toBe(false);
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

  // Displayed 4.0 15.0 10.0 15.0 12.0 12.0 15.0 10.0 3.0 3.0 1.0 = 100.0, the exact quantities add up to 100 000
  const BASELINE = [4012, 14989, 9996, 15007, 12003, 11990, 15004, 9993, 3002, 3004, 1000];
  const KG_PER_LB = 0.45359237;

  it.each([true, false])('moving 0.3 of the display unit between two tanks still computes (metric %s)', (metric) => {
    const unit = metric ? 1 : KG_PER_LB;
    const baseline = BASELINE.map((value) => value * unit);
    const fob = 100_000 * unit;
    const entries: (number | null)[] = [...baseline];
    entries[2] = 10_300 * unit;
    entries[3] = 14_700 * unit;
    const distribution = manualDistribution(entries, DENSITY, baseline, metric);
    expect(manualDistributionMatchesFob(distribution, fob, metric)).toBe(true);
    expect(Math.abs(sum(fitManualDistributionToFob(distribution, fob, DENSITY)!) - fob)).toBeLessThan(1);
  });

  // Rounded tanks 4.0 15.0 10.0 15.0 12.0 12.0 15.0 10.0 3.0 3.0 1.0 = 100.0 while the exact quantities, ending in .049 or
  // .951 t, add up to 100 040: the per-tank rounding errors do not cancel
  const UNBALANCED_BASELINE = [3951, 14951, 10049, 15049, 11951, 12049, 14951, 9951, 3049, 3049, 1040];

  it('compares the sum of the displayed tanks, the value the FOB box shows, when the rounding errors do not cancel', () => {
    expect(sum(UNBALANCED_BASELINE)).toBe(100_040);
    expect(displayedTankTotal(UNBALANCED_BASELINE, true)).toBeCloseTo(100, 9);
    const entries: (number | null)[] = [...UNBALANCED_BASELINE];
    entries[2] = 10_300;
    entries[3] = 14_700;
    const distribution = manualDistribution(entries, DENSITY, UNBALANCED_BASELINE, true);
    expect(displayedTankTotal(distribution, true)).toBeCloseTo(100, 9);
    expect(manualDistributionMatchesFob(distribution, 100_040, true)).toBe(true);
    const fitted = fitManualDistributionToFob(distribution, 100_040, DENSITY);
    expect(fitted).not.toBeNull();
    expect(Math.abs(sum(fitted!) - 100_040)).toBeLessThan(1);
  });

  it('refuses the match when the remainder cannot be placed within the tank capacities', () => {
    const full = [...CAPACITIES];
    expect(fitManualDistributionToFob(full, sum(full) + 500, DENSITY)).toBeNull();
    expect(fitManualDistributionToFob(full, sum(full), DENSITY)).not.toBeNull();
  });

  it('refuses a single edited tank that changes the displayed total', () => {
    const entries: (number | null)[] = [...BASELINE];
    entries[2] = 10_300;
    expect(manualDistributionMatchesFob(manualDistribution(entries, DENSITY, BASELINE, true), 100_000, true)).toBe(
      false,
    );
  });
});
