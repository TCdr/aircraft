// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { optionalNumber } from './simbriefNumbers';

describe('optionalNumber', () => {
  it('reads numbers and numeric texts', () => {
    expect(optionalNumber(12)).toBe(12);
    expect(optionalNumber('485')).toBe(485);
    expect(optionalNumber('-4.5')).toBe(-4.5);
  });

  it('is undefined for a missing or non-numeric field, so an OFP without it leaves the cell blank', () => {
    expect(optionalNumber(undefined)).toBeUndefined();
    expect(optionalNumber(null)).toBeUndefined();
    expect(optionalNumber('')).toBeUndefined();
    expect(optionalNumber('n/a')).toBeUndefined();
  });
});
