// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { nacelleTemperaturePulses } from './NacelleTemperature';

describe('SD ENG page nacelle temperature', () => {
  it('pulses above the 300 °C advisory only', () => {
    expect(nacelleTemperaturePulses(150)).toBe(false);
    expect(nacelleTemperaturePulses(300)).toBe(false);
    expect(nacelleTemperaturePulses(301)).toBe(true);
  });
});
