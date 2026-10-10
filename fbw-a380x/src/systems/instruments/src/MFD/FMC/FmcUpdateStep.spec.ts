// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { clampFmcUpdateStep } from './FmcUpdateStep';

describe('FMC update step on sim time', () => {
  it('ignores the first update (no previous time)', () => {
    expect(clampFmcUpdateStep(0, 1_000_000)).toBe(0);
  });
  it('passes a normal 5 Hz step', () => {
    expect(clampFmcUpdateStep(1_000_000, 1_000_200)).toBe(200);
  });
  it('passes an 8x sim rate step (200 ms real = 1.6 s sim)', () => {
    expect(clampFmcUpdateStep(1_000_000, 1_001_600)).toBe(1600);
  });
  it('passes a 16x sim rate step (200 ms real = 3.2 s sim)', () => {
    expect(clampFmcUpdateStep(1_000_000, 1_003_200)).toBe(3200);
  });
  it('caps a pause or sim time jump at 5 s', () => {
    expect(clampFmcUpdateStep(1_000_000, 1_060_000)).toBe(5000);
  });
});
