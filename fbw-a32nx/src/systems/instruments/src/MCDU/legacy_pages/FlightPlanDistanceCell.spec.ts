// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { flightPlanDistanceCell } from './FlightPlanDistanceCell';

describe('F-PLN distance cell', () => {
  it('shows the distance rounded to the NM, between 0 and 9999', () => {
    expect(flightPlanDistanceCell(42.4)).toBe('42');
    expect(flightPlanDistanceCell(-3)).toBe('0');
    expect(flightPlanDistanceCell(12345)).toBe('9999');
  });

  it('is blank, not "NaN", without a computed distance', () => {
    expect(flightPlanDistanceCell(NaN)).toBe('');
    expect(flightPlanDistanceCell(undefined)).toBe('');
    expect(flightPlanDistanceCell(Infinity)).toBe('');
  });
});
