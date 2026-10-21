// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { doorBits, doorFlags, isDoorBitSet } from './DoorsAndSlides';

describe('DSMS door bit fields', () => {
  it('bit n is the door at interactive point n', () => {
    const flags = new Array(16).fill(false);
    flags[0] = true;
    flags[11] = true;
    expect(doorBits(flags)).toBe(1 + 2048);
    expect(isDoorBitSet(2049, 11)).toBe(true);
    expect(isDoorBitSet(2049, 10)).toBe(false);
    expect(doorFlags(doorBits(flags))).toEqual(flags);
  });

  it('reads a field of fewer doors, and a value read back as a float', () => {
    expect(doorFlags(2, 2)).toEqual([false, true]);
    expect(isDoorBitSet(4.0000001, 2)).toBe(true);
  });
});
