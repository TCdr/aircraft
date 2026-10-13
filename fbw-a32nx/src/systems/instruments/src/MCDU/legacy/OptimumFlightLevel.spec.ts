// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { optimumFlightLevelForWeight, progOptimumFlightLevel } from './OptimumFlightLevel';

describe('PROG page OPT FL (A320 FCOM l.15872-15898, A320neo FCOM PER-CRZ-CRT-30 LRC ISA)', () => {
  it('follows the best specific range level of the FCOM long range cruise table', () => {
    expect(optimumFlightLevelForWeight(64)).toBe(392);
    expect(optimumFlightLevelForWeight(70)).toBe(371);
    expect(optimumFlightLevelForWeight(72)).toBeCloseTo(365.5, 5);
    expect(optimumFlightLevelForWeight(78)).toBe(349);
    // A heavier aircraft has a lower optimum
    expect(optimumFlightLevelForWeight(79)).toBeLessThan(349);
    expect(optimumFlightLevelForWeight(60)).toBeGreaterThan(403);
  });

  it('is the economic level, not the REC MAX: below it at high weights, the REC MAX at light weights', () => {
    // 70 t, REC MAX FL383 (the old OPT FL showed FL380, the REC MAX rounded down)
    expect(progOptimumFlightLevel(70, 383, false)).toBe(370);
    // 76 t: FL352 -> FL350
    expect(progOptimumFlightLevel(76, 368, false)).toBe(350);
    // 58 t: the best specific range is above the REC MAX
    expect(progOptimumFlightLevel(58, 398, false)).toBe(395);
  });

  it('shows dashes with an engine out or without gross weight / REC MAX', () => {
    expect(progOptimumFlightLevel(70, 383, true)).toBeNull();
    expect(progOptimumFlightLevel(null, 383, false)).toBeNull();
    expect(progOptimumFlightLevel(70, null, false)).toBeNull();
  });
});
