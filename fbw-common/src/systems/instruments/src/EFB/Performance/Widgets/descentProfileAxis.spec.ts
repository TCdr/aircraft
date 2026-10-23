// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { distanceTickStep } from './descentProfileAxis';

describe('distance labels of the descent profile', () => {
  it('keeps short descents on fine steps', () => {
    expect(distanceTickStep(60)).toBe(10);
    expect(distanceTickStep(114)).toBe(20);
    expect(distanceTickStep(150)).toBe(20);
  });

  it('never puts more than 8 intervals on the axis', () => {
    for (const span of [1, 81, 161, 400, 999, 1700, 4000, 40_000]) {
      const step = distanceTickStep(span);
      expect(span / step <= 8 || step === 5000).toBe(true);
    }
  });

  it('spaces a far descent check out to round hundreds', () => {
    expect(distanceTickStep(999)).toBe(200);
    expect(distanceTickStep(1700)).toBe(250);
  });
});
