// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  DEGRADED_ACCURACY_DASHES,
  isDiscrepancyCheckVisible,
  lastDigitColor,
  lastDigitText,
} from './EngineIndicationAccuracy';

const DMC_CAPT_3 = 0;
const DMC_NORM = 1;
const DMC_FO_3 = 2;

describe('E/WD N1 and N2 of degraded accuracy', () => {
  it('shows the last digit in the color of the value with the sensors working', () => {
    expect(lastDigitText('4', false)).toBe('4');
    expect(lastDigitColor('Green', false)).toBe('Green');
    expect(lastDigitColor('Red', false)).toBe('Red');
  });

  it('replaces the last digit by two amber dashes with the core sensors failed', () => {
    expect(lastDigitText('4', true)).toBe(DEGRADED_ACCURACY_DASHES);
    expect(DEGRADED_ACCURACY_DASHES).toBe('--');
    expect(lastDigitColor('Green', true)).toBe('Amber');
  });
});

describe('E/WD amber CHECK on a FADEC-DMC discrepancy', () => {
  it('is hidden without a discrepancy', () => {
    expect(isDiscrepancyCheckVisible(false, DMC_NORM, true)).toBe(false);
  });

  it('shows under the parameter with a discrepancy on DMC 1', () => {
    expect(isDiscrepancyCheckVisible(true, DMC_NORM, true)).toBe(true);
    // DMC 3 replacing DMC 2 leaves the E/WD on DMC 1
    expect(isDiscrepancyCheckVisible(true, DMC_FO_3, true)).toBe(true);
  });

  it('is gone once the E/WD is on DMC 3 (EIS DMC switching CAPT 3)', () => {
    expect(isDiscrepancyCheckVisible(true, DMC_CAPT_3, true)).toBe(false);
  });

  it('is hidden while the FADEC sends no data (the value is XX)', () => {
    expect(isDiscrepancyCheckVisible(true, DMC_NORM, false)).toBe(false);
  });
});
