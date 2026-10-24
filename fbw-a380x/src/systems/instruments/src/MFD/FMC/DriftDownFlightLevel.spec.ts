// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { driftDownFlightLevel } from './DriftDownFlightLevel';

describe('driftDownFlightLevel', () => {
  it('rounds the altitude to a whole flight level', () => {
    expect(driftDownFlightLevel(36_476.5625)).toBe(365);
    expect(String(driftDownFlightLevel(36_476.5625))).toBe('365');
    expect(driftDownFlightLevel(9_800)).toBe(98);
  });

  it('has no flight level without an altitude', () => {
    expect(driftDownFlightLevel(undefined)).toBeNull();
    expect(driftDownFlightLevel(Number.NaN)).toBeNull();
  });
});
