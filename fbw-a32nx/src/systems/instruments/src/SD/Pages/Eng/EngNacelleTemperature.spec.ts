// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { nacelleTemperatureClassName, nacelleTemperatureShown } from './EngNacelleTemperature';

describe('SD ENG page nacelle temperature', () => {
  it('appears only when an engine nacelle goes above the 240 C advisory limit', () => {
    expect(nacelleTemperatureShown([200, 240], [1, 1])).toBe(false);
    expect(nacelleTemperatureShown([200, 241], [1, 1])).toBe(true);
    expect(nacelleTemperatureShown([250, 100], [1, 1])).toBe(true);
  });

  it('does not appear during the start sequence', () => {
    expect(nacelleTemperatureShown([250, 100], [2, 1])).toBe(false);
    expect(nacelleTemperatureShown([250, 100], [1, 3])).toBe(false);
  });

  it('is green, and pulses green above the advisory limit', () => {
    expect(nacelleTemperatureClassName(240)).toBe('FillGreen');
    expect(nacelleTemperatureClassName(241)).toBe('FillPulse');
  });
});
