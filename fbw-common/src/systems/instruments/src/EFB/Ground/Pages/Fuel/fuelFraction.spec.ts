// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { fuelFraction } from './fuelFraction';

describe('fuel fraction of a tank', () => {
  it('is the quantity over the capacity', () => {
    expect(fuelFraction(2_000, 8_000)).toBe(0.25);
    expect(fuelFraction(8_000, 8_000)).toBe(1);
  });

  it('counts a negative quantity (unusable fuel reading) as empty', () => {
    expect(fuelFraction(-5, 8_000)).toBe(0);
  });

  it('is 0, not NaN, without a capacity (empty tanks)', () => {
    expect(fuelFraction(0, 0)).toBe(0);
  });

  it('is 0, not Infinity (a full bar), with fuel but no capacity', () => {
    expect(fuelFraction(1_500, 0)).toBe(0);
    expect(fuelFraction(1_500, NaN)).toBe(0);
  });
});
