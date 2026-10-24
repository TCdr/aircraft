// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { a32nxFuelOnBoardKg } from './fuelOnBoard';

describe('a32nxFuelOnBoardKg', () => {
  it('sums the five tanks and converts them to kilograms', () => {
    // 2,000 gal at 3.04 kg/gal
    expect(a32nxFuelOnBoardKg([0, 600, 400, 600, 400], 3.04)).toBeCloseTo(6080, 3);
  });

  it('counts no fuel until the weight of a gallon is known', () => {
    expect(a32nxFuelOnBoardKg([0, 600, 400, 600, 400], 0)).toBe(0);
  });

  it('ignores a negative tank reading', () => {
    expect(a32nxFuelOnBoardKg([-5, 100, 0, 100, 0], 3)).toBe(600);
  });
});
