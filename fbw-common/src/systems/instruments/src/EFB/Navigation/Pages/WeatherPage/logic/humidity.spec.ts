// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { relativeHumidityPercent } from './humidity';

describe('relativeHumidityPercent', () => {
  it('is 94 % for RJOA 20/19 and 19/18', () => {
    expect(relativeHumidityPercent(20, 19)).toBe(94);
    expect(relativeHumidityPercent(19, 18)).toBe(94);
  });

  it('is 100 % at saturation and lower for a dry air mass, also below zero', () => {
    expect(relativeHumidityPercent(15, 15)).toBe(100);
    expect(relativeHumidityPercent(30, 10)).toBe(29);
    expect(relativeHumidityPercent(-5, -7)).toBe(86);
  });
});
