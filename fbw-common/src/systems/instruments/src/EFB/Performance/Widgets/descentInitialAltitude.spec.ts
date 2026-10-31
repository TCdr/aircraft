// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { fmsInitialAltitude } from './descentInitialAltitude';

const CLIMB = 2;
const CRUISE = 3;
const DESCENT = 4;
const APPROACH = 5;

describe('fmsInitialAltitude', () => {
  it('uses the cruise altitude in the climb, even when the aircraft is already above 5 000 ft', () => {
    expect(fmsInitialAltitude(20_000, 36_000, CLIMB)).toBe(36_000);
  });

  it('uses the cruise altitude in cruise', () => {
    expect(fmsInitialAltitude(36_000, 36_000, CRUISE)).toBe(36_000);
  });

  it('uses the current level in the descent once below the cruise altitude', () => {
    expect(fmsInitialAltitude(20_000, 36_000, DESCENT)).toBe(20_000);
  });

  it('uses the cruise altitude in the descent before leaving it', () => {
    expect(fmsInitialAltitude(36_000, 36_000, DESCENT)).toBe(36_000);
  });

  it('uses the cruise altitude when the level is not above 5 000 ft', () => {
    expect(fmsInitialAltitude(4_000, 36_000, APPROACH)).toBe(36_000);
  });

  it('has no initial altitude without an FMS cruise altitude', () => {
    expect(fmsInitialAltitude(20_000, null, DESCENT)).toBeUndefined();
  });
});
