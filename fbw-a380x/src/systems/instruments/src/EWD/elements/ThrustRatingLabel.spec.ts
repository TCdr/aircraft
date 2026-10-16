// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { thrustRatingModeLabel } from './ThrustRatingLabel';

describe('E/WD thrust rating mode', () => {
  // FCOM DSC-70-90 l.112943-112944: "6 derated takeoff levels are defined: D04, D08, D12, D16, D20, D24."
  it('shows the derated takeoff level in place of FLX', () => {
    expect(thrustRatingModeLabel(3, 4)).toBe('D04');
    expect(thrustRatingModeLabel(3, 12)).toBe('D12');
    expect(thrustRatingModeLabel(3, 24)).toBe('D24');
  });

  it('keeps the other modes', () => {
    expect(thrustRatingModeLabel(3, 0)).toBe('FLX');
    expect(thrustRatingModeLabel(4, 12)).toBe('TOGA');
    expect(thrustRatingModeLabel(1, 12)).toBe('CLB');
    expect(thrustRatingModeLabel(2, 0)).toBe('MCT');
    expect(thrustRatingModeLabel(0, 0)).toBe('');
  });
});
