// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  degradedAccuracyShown,
  degradedAccuracyStrikePath,
  FUEL_FLOW_STRUCK_DIGITS,
  ROTOR_SPEED_STRUCK_DIGITS,
} from './DegradedAccuracy';

describe('Degraded accuracy of an engine value', () => {
  it('strikes the decimal digit of the N1 and N2 with two lines', () => {
    expect(degradedAccuracyStrikePath(100, 50, 12, 15, ROTOR_SPEED_STRUCK_DIGITS)).toBe('M 88 45 H 100 M 88 40 H 100');
  });

  it('strikes the last three digits of the fuel flow', () => {
    expect(degradedAccuracyStrikePath(100, 50, 12, 15, FUEL_FLOW_STRUCK_DIGITS)).toBe('M 64 45 H 100 M 64 40 H 100');
  });

  it('shows with CTL SYS FAULT on a shown value only', () => {
    expect(degradedAccuracyShown(true, true)).toBe(true);
    expect(degradedAccuracyShown(false, true)).toBe(false);
    expect(degradedAccuracyShown(true, false)).toBe(false);
  });
});
