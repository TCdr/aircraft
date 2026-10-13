// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { holdEntryPrediction, holdLastExit } from './HoldLastExit';

describe('HOLD page LAST EXIT (A320 FCOM l.18272-18275, A380 FCOM l.36440-36444)', () => {
  const atFix = { secondsFromPresent: 1200, fuelOnBoard: 6.4 };

  it('arrives in a hold ahead at the hold fix predictions', () => {
    expect(holdEntryPrediction(12, 8, 7.5, atFix)).toEqual({ secondsFromPresent: 1200, fuelOnBoard: 6.4 });
  });

  it('is in the hold now when the hold leg is the active leg', () => {
    expect(holdEntryPrediction(12, 12, 7.5, atFix)).toEqual({ secondsFromPresent: 0, fuelOnBoard: 7.5 });
    expect(holdEntryPrediction(12, 12, null, atFix)).toBe(null);
  });

  it('has no last exit for a hold behind the aircraft or without predictions', () => {
    expect(holdEntryPrediction(5, 8, 7.5, atFix)).toBe(null);
    expect(holdEntryPrediction(12, 8, 7.5, undefined)).toBe(null);
    expect(holdEntryPrediction(12, 8, 7.5, { secondsFromPresent: NaN, fuelOnBoard: 6.4 })).toBe(null);
  });

  it('leaves when the EXTRA fuel is burnt: hold fix time + EXTRA time, hold fix fuel - EXTRA fuel', () => {
    // 1.2 t of EXTRA, lasting 30 min at the holding fuel flow
    expect(holdLastExit({ secondsFromPresent: 1200, fuelOnBoard: 6.4 }, 1.2, 30)).toEqual({
      secondsFromPresent: 1200 + 30 * 60,
      fuelOnBoard: 6.4 - 1.2,
    });
  });

  it('leaves at once without EXTRA fuel (TIME TO EXIT)', () => {
    expect(holdLastExit({ secondsFromPresent: 0, fuelOnBoard: 5 }, 0, 0)).toEqual({
      secondsFromPresent: 0,
      fuelOnBoard: 5,
    });
    expect(holdLastExit({ secondsFromPresent: 600, fuelOnBoard: 5 }, -0.4, -8)).toEqual({
      secondsFromPresent: 600,
      fuelOnBoard: 5,
    });
  });

  it('has no last exit without the EXTRA fuel or its time', () => {
    expect(holdLastExit(null, 1, 10)).toBe(null);
    expect(holdLastExit({ secondsFromPresent: 0, fuelOnBoard: 5 }, null, 10)).toBe(null);
    expect(holdLastExit({ secondsFromPresent: 0, fuelOnBoard: 5 }, 1, null)).toBe(null);
  });
});
