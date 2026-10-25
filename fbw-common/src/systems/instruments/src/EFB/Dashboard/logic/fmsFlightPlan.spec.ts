// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { fmsHasFlightPlan } from './fmsFlightPlan';

describe('fmsHasFlightPlan', () => {
  it('is true once the active plan has a destination', () => {
    expect(fmsHasFlightPlan({ destination: 'RJOA' })).toBe(true);
  });

  it('is false when the FMS answers without a destination', () => {
    expect(fmsHasFlightPlan({ destination: null })).toBe(false);
  });

  it('is false when the FMS does not answer', () => {
    expect(fmsHasFlightPlan(null)).toBe(false);
  });
});
