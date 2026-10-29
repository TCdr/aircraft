// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { RmpState } from '@flybywiresim/rmp';
import { resolveRmpState } from './RmpPowerState';

describe('resolveRmpState', () => {
  it('turns on at once when the power-up slot has passed', () => {
    expect(resolveRmpState(true, true, false, 0)).toBe(RmpState.On);
  });

  it('stays dark in standby while it waits for its power-up slot', () => {
    expect(resolveRmpState(true, true, false, 1.5)).toBe(RmpState.OffStandby);
  });

  it('is in standby with the brightness knob at OFF', () => {
    expect(resolveRmpState(true, false, false, 0)).toBe(RmpState.OffStandby);
  });

  it('shows a failure at once, without waiting', () => {
    expect(resolveRmpState(true, true, true, 2)).toBe(RmpState.OnFailed);
    expect(resolveRmpState(true, false, true, 2)).toBe(RmpState.OffFailed);
  });

  it('shows the unsupplied states without waiting', () => {
    expect(resolveRmpState(false, true, false, 0)).toBe(RmpState.OnFailed);
    expect(resolveRmpState(false, false, false, 0)).toBe(RmpState.OffFailed);
  });
});
