// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { wingImbalancePulse } from './FuelImbalanceIndication';

/* Fuel quantity advisory: wing imbalance */
describe('FUEL page wing imbalance advisory', () => {
  it('pulses the heavier wing above 1 500 kg in phase 6', () => {
    expect(wingImbalancePulse(6_000, 4_400, 6)).toEqual({ left: true, right: false });
    expect(wingImbalancePulse(4_400, 6_000, 6)).toEqual({ left: false, right: true });
  });

  it('pulses in phase 2', () => {
    expect(wingImbalancePulse(6_000, 4_400, 2)).toEqual({ left: true, right: false });
  });

  it('does not pulse at 1 500 kg or less', () => {
    expect(wingImbalancePulse(5_900, 4_400, 6)).toEqual({ left: false, right: false });
  });

  it('does not pulse in the other flight phases', () => {
    for (const phase of [1, 3, 4, 5, 7, 8, 9, 10]) {
      expect(wingImbalancePulse(6_000, 4_000, phase)).toEqual({ left: false, right: false });
    }
  });
});
