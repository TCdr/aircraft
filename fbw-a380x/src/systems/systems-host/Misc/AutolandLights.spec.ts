// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isAutolandLightLit } from './AutolandLights';

describe('AUTOLAND light (A380 FCOM DSC-22-FG-80-100)', () => {
  it('stays dark without warning and without press', () => {
    for (let t = 0; t < 3000; t += 100) {
      expect(isAutolandLightLit(false, false, t)).toBe(false);
    }
  });

  it('flashes at 1 Hz while pressed (light test)', () => {
    expect(isAutolandLightLit(false, true, 0)).toBe(true);
    expect(isAutolandLightLit(false, true, 499)).toBe(true);
    expect(isAutolandLightLit(false, true, 500)).toBe(false);
    expect(isAutolandLightLit(false, true, 999)).toBe(false);
    expect(isAutolandLightLit(false, true, 1000)).toBe(true);
  });

  it('flashes the same way on the autoland warning', () => {
    expect(isAutolandLightLit(true, false, 250)).toBe(true);
    expect(isAutolandLightLit(true, false, 750)).toBe(false);
  });
});
