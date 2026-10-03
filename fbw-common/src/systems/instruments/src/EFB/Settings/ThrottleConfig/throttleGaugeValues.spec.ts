// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isThrottleInDetent, throttleGaugePercent } from './throttleGaugeValues';

describe('throttleGaugePercent', () => {
  it('maps reverse full (-1) to the bottom, 0 to the middle and TOGA (+1) to the top', () => {
    expect(throttleGaugePercent(-1)).toBe(0);
    expect(throttleGaugePercent(0)).toBe(50);
    expect(throttleGaugePercent(1)).toBe(100);
    expect(throttleGaugePercent(0.5)).toBe(75);
  });

  it('keeps out of range values and invalid input on the gauge', () => {
    expect(throttleGaugePercent(-1.2)).toBe(0);
    expect(throttleGaugePercent(1.3)).toBe(100);
    expect(throttleGaugePercent(Number.NaN)).toBe(0);
  });
});

describe('isThrottleInDetent', () => {
  it('is true for a lever inside the detent bounds, false outside', () => {
    expect(isThrottleInDetent(0.3, 0.25, 0.35)).toBe(true);
    expect(isThrottleInDetent(0.2, 0.25, 0.35)).toBe(false);
    expect(isThrottleInDetent(0.4, 0.25, 0.35)).toBe(false);
  });

  it('compares the bounds as displayed (2 decimals) and the lever to 2 significant digits', () => {
    // 0.354 is shown as 0.35 and the lever 0.3549 rounds to 0.35: inside
    expect(isThrottleInDetent(0.3549, 0.25, 0.354)).toBe(true);
    // the lever 0.356 rounds to 0.36: outside a detent ending at 0.35
    expect(isThrottleInDetent(0.356, 0.25, 0.35)).toBe(false);
  });

  it('counts a lever at exactly 0.00 inside a detent around zero', () => {
    expect(isThrottleInDetent(0, -0.05, 0.05)).toBe(true);
  });

  it('counts a lever at -1.00 inside a detent ending at -1.00 (reverse full at the stop)', () => {
    expect(isThrottleInDetent(-1, -1, -1)).toBe(true);
  });

  it('is false for invalid input', () => {
    expect(isThrottleInDetent(Number.NaN, -1, 1)).toBe(false);
    expect(isThrottleInDetent(0, undefined as unknown as number, 1)).toBe(false);
  });
});
