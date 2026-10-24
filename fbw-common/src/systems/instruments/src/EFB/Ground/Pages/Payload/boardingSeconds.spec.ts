// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { boardingSeconds } from './boardingSeconds';

describe('boardingSeconds', () => {
  const base = { boardingRate: 'REAL', doorsOpen: 1, paxDifference: 100, cargoDifferenceKg: 0 };

  it('takes 5 s per passenger at the real rate and 1 s at the fast rate', () => {
    expect(boardingSeconds(base)).toBe(500);
    expect(boardingSeconds({ ...base, boardingRate: 'FAST' })).toBe(100);
  });

  it('is zero at the instant rate', () => {
    expect(boardingSeconds({ ...base, boardingRate: 'INSTANT' })).toBe(0);
  });

  it('shares the work over the open doors, counting no door as one', () => {
    expect(boardingSeconds({ ...base, doorsOpen: 2 })).toBe(250);
    expect(boardingSeconds({ ...base, doorsOpen: 0 })).toBe(500);
  });

  it('follows the cargo when it takes longer than the passengers', () => {
    expect(boardingSeconds({ ...base, paxDifference: 10, cargoDifferenceKg: 6000 })).toBe(500);
  });
});
