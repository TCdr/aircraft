// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { COLLECTOR_CELL_CAPACITY_KG, COLLECTOR_CELL_NOT_FULL_KG } from '@shared/FuelTankIndications';
import { COLLECTOR_CELL_REFILL_RATE_KG_PER_HOUR, CollectorCell } from './FuelCollectorCells';

/** Runs a collector cell for some seconds, one update a second, the feed tank losing burnKgPerHour */
function run(
  cell: CollectorCell,
  seconds: number,
  feed: { kg: number },
  pumpRunning: boolean,
  engineRunning = true,
  burnKgPerHour = 3_600,
): number {
  let quantityKg = 0;
  for (let s = 0; s < seconds; s++) {
    feed.kg -= engineRunning ? burnKgPerHour / 3600 : 0;
    quantityKg = cell.update({ feedTankKg: feed.kg, pumpRunning, engineRunning }, 1);
  }
  return quantityKg;
}

describe('A380 feed tank collector cell (FCOM DSC-28-10 l.57265-57271)', () => {
  it('starts full and stays full while a feed tank pump runs', () => {
    const cell = new CollectorCell();
    const feed = { kg: 20_000 };
    expect(cell.update({ feedTankKg: feed.kg, pumpRunning: true, engineRunning: true }, 0)).toBeCloseTo(
      COLLECTOR_CELL_CAPACITY_KG,
    );
    expect(run(cell, 600, feed, true)).toBeCloseTo(COLLECTOR_CELL_CAPACITY_KG);
  });

  it('never holds more than the feed tank', () => {
    const cell = new CollectorCell();
    expect(cell.update({ feedTankKg: 900, pumpRunning: true, engineRunning: true }, 1)).toBe(900);
  });

  it('empties when the engine is fed by gravity, its pumps lost (FCOM l.138086-138093 collector cell depletion)', () => {
    const cell = new CollectorCell();
    const feed = { kg: 20_000 };
    cell.update({ feedTankKg: feed.kg, pumpRunning: false, engineRunning: true }, 0);
    // 3 600 kg/h for 10 min = 600 kg out of the cell
    const quantityKg = run(cell, 600, feed, false);
    expect(quantityKg).toBeCloseTo(COLLECTOR_CELL_CAPACITY_KG - 600, 0);
    // About 22 min: below the NOT FULL threshold
    expect(run(cell, 15 * 60, feed, false)).toBeLessThan(COLLECTOR_CELL_NOT_FULL_KG);
  });

  it('refills once a pump runs again, at the refill rate', () => {
    const cell = new CollectorCell();
    const feed = { kg: 20_000 };
    cell.update({ feedTankKg: feed.kg, pumpRunning: false, engineRunning: true }, 0);
    const depletedKg = run(cell, 1200, feed, false);
    const refilledKg = run(cell, 60, feed, true);
    expect(refilledKg).toBeCloseTo(
      Math.min(depletedKg + COLLECTOR_CELL_REFILL_RATE_KG_PER_HOUR / 60, COLLECTOR_CELL_CAPACITY_KG),
      0,
    );
    expect(run(cell, 600, feed, true)).toBeCloseTo(COLLECTOR_CELL_CAPACITY_KG);
  });

  it('is refilled with the engine off (no fuel drawn), even without a pump', () => {
    const cell = new CollectorCell();
    const feed = { kg: 20_000 };
    cell.update({ feedTankKg: feed.kg, pumpRunning: false, engineRunning: true }, 0);
    run(cell, 1200, feed, false);
    expect(run(cell, 600, feed, false, false)).toBeCloseTo(COLLECTOR_CELL_CAPACITY_KG);
  });
});
