// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { packOutletTemperatureDisplay } from './PackOutletTemperature';

describe('BLEED page pack outlet temperature (FCOM DSC-21-10-50 ECAM BLEED PAGE)', () => {
  it('shows the temperature in 5 °C steps', () => {
    expect(packOutletTemperatureDisplay(16.06).value).toBe(15);
    expect(packOutletTemperatureDisplay(29.0).value).toBe(30);
    expect(packOutletTemperatureDisplay(8.03).value).toBe(10);
  });

  it('is green up to 90 °C and amber above', () => {
    expect(packOutletTemperatureDisplay(90).amber).toBe(false);
    expect(packOutletTemperatureDisplay(90.5).amber).toBe(true);
  });
});
