// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isFlexTemperatureShown, thrustRatingModeLabel } from './ThrustRatingLabel';

describe('E/WD thrust rating mode', () => {
  // FCOM DSC-70-90 l.112943-112944: "6 derated takeoff levels are defined: D04, D08, D12, D16, D20, D24."
  it('shows the derated takeoff level in place of FLX', () => {
    expect(thrustRatingModeLabel(3, 4, 0)).toBe('D04');
    expect(thrustRatingModeLabel(3, 12, 0)).toBe('D12');
    expect(thrustRatingModeLabel(3, 24, 0)).toBe('D24');
  });

  // 3 derated climb levels: DCLB1, DCLB2, DCLB3
  it('shows the derated climb level in place of CLB', () => {
    expect(thrustRatingModeLabel(1, 0, 1)).toBe('DCLB1');
    expect(thrustRatingModeLabel(1, 0, 2)).toBe('DCLB2');
    expect(thrustRatingModeLabel(1, 12, 3)).toBe('DCLB3');
  });

  it('keeps the other modes', () => {
    expect(thrustRatingModeLabel(3, 0, 0)).toBe('FLX');
    expect(thrustRatingModeLabel(4, 12, 2)).toBe('TOGA');
    expect(thrustRatingModeLabel(1, 12, 0)).toBe('CLB');
    expect(thrustRatingModeLabel(2, 0, 2)).toBe('MCT');
    expect(thrustRatingModeLabel(3, 0, 2)).toBe('FLX');
    expect(thrustRatingModeLabel(0, 0, 0)).toBe('');
  });

  it('shows the flexible temperature in the FLEX thrust rating mode', () => {
    expect(isFlexTemperatureShown(3, 50, 0)).toBe(true);
    expect(isFlexTemperatureShown(3, -5, 0)).toBe(true);
  });

  it('shows no flexible temperature outside the FLEX mode, without one entered, or for a derated takeoff', () => {
    expect(isFlexTemperatureShown(4, 50, 0)).toBe(false);
    expect(isFlexTemperatureShown(1, 50, 0)).toBe(false);
    expect(isFlexTemperatureShown(3, 0, 0)).toBe(false);
    expect(isFlexTemperatureShown(3, 50, 8)).toBe(false);
  });
});
