// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { N1_VIBRATION_ADVISORY_UNITS, N2_VIBRATION_ADVISORY_UNITS, vibrationClassName } from './EngVibration';

describe('SD ENG page vibrations', () => {
  it('pulses the N1 vibration from the 6 units of the VIB advisory', () => {
    expect(vibrationClassName(5.9, N1_VIBRATION_ADVISORY_UNITS)).toBe('FillGreen');
    expect(vibrationClassName(6, N1_VIBRATION_ADVISORY_UNITS)).toBe('FillPulse');
  });

  it('pulses the N2 vibration from the 4.3 units of the VIB advisory', () => {
    expect(vibrationClassName(4.2, N2_VIBRATION_ADVISORY_UNITS)).toBe('FillGreen');
    expect(vibrationClassName(4.3, N2_VIBRATION_ADVISORY_UNITS)).toBe('FillPulse');
  });
});
