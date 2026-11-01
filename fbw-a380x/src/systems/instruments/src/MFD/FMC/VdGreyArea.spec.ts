// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isGreyAreaTrackChange } from './VdGreyArea';

describe('VD grey area track change', () => {
  it('ignores a straight route crossing north', () => {
    expect(isGreyAreaTrackChange(359, 1)).toBe(false);
    expect(isGreyAreaTrackChange(1, 359)).toBe(false);
    expect(isGreyAreaTrackChange(358.5, 0.5)).toBe(false);
  });

  it('starts at a turn of more than 3 degrees across north', () => {
    expect(isGreyAreaTrackChange(358, 2)).toBe(true);
    expect(isGreyAreaTrackChange(5, 355)).toBe(true);
  });

  it('ignores a track change of up to 3 degrees', () => {
    expect(isGreyAreaTrackChange(90, 92)).toBe(false);
    expect(isGreyAreaTrackChange(92, 89)).toBe(false);
    expect(isGreyAreaTrackChange(180, 180)).toBe(false);
  });

  it('starts at a turn of more than 3 degrees either way', () => {
    expect(isGreyAreaTrackChange(90, 93.5)).toBe(true);
    expect(isGreyAreaTrackChange(90, 45)).toBe(true);
    expect(isGreyAreaTrackChange(270, 300)).toBe(true);
  });

  it('starts at a reversal of track', () => {
    expect(isGreyAreaTrackChange(10, 190)).toBe(true);
    expect(isGreyAreaTrackChange(350, 170)).toBe(true);
  });
});
