// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isCruiseSpeedLimitApplied, managedCruiseSecondsToReference } from './PerfCruiseSpeedTable';

describe('PERF CRZ table, MANAGED line with the selected speed control', () => {
  it('time to the reference point at the managed true airspeed, with the present wind component', () => {
    // 50 kt headwind: 490 kt TAS gives 440 kt; the managed 500 kt TAS gives 450 kt over 450 NM: 1 h
    expect(managedCruiseSecondsToReference(450, 500, 440, 490)).toBeCloseTo(3600, 6);
    // tailwind
    expect(managedCruiseSecondsToReference(550, 500, 540, 490)).toBeCloseTo(3600, 6);
  });

  it('no time once the reference point is behind, or without a ground speed', () => {
    expect(managedCruiseSecondsToReference(-1, 500, 440, 490)).toBeNull();
    expect(managedCruiseSecondsToReference(100, 0, 0, 490)).toBeNull();
    expect(managedCruiseSecondsToReference(NaN, 500, 440, 490)).toBeNull();
  });
});

describe('PERF CRZ table, ECON line with the managed speed control', () => {
  const limit = { speed: 250, underAltitude: 10000 };

  it('shown when the climb speed limit lowers the managed cruise speed', () => {
    expect(isCruiseSpeedLimitApplied(limit, 9000, 300)).toBe(true);
  });

  it('not above the speed limit altitude, without a speed limit, or when ECON is slower', () => {
    expect(isCruiseSpeedLimitApplied(limit, 10000, 300)).toBe(false);
    expect(isCruiseSpeedLimitApplied(null, 9000, 300)).toBe(false);
    expect(isCruiseSpeedLimitApplied(limit, 9000, 240)).toBe(false);
  });
});
