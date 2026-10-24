// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { plannedMinutesToTod } from './timeToTod';

const MIN = 60_000;
const TAKEOFF = 1_000_000_000;
const TOD_AFTER_TAKEOFF_S = 90 * 60;

describe('plannedMinutesToTod', () => {
  it('counts down from the takeoff time plus the navlog time', () => {
    expect(plannedMinutesToTod(TAKEOFF, TOD_AFTER_TAKEOFF_S, TAKEOFF + 60 * MIN)).toBe(30);
  });

  it('shifts with a late takeoff: 20 minutes late is 20 minutes more to go', () => {
    const now = TAKEOFF + 60 * MIN;
    const onTime = plannedMinutesToTod(TAKEOFF, TOD_AFTER_TAKEOFF_S, now) as number;
    expect(plannedMinutesToTod(TAKEOFF + 20 * MIN, TOD_AFTER_TAKEOFF_S, now)).toBe(onTime + 20);
  });

  it('is null before takeoff or without a planned T/D', () => {
    expect(plannedMinutesToTod(null, TOD_AFTER_TAKEOFF_S, TAKEOFF)).toBeNull();
    expect(plannedMinutesToTod(TAKEOFF, null, TAKEOFF)).toBeNull();
  });

  it('is zero once the planned T/D has passed, never negative', () => {
    expect(plannedMinutesToTod(TAKEOFF, TOD_AFTER_TAKEOFF_S, TAKEOFF + 120 * MIN)).toBe(0);
  });
});
