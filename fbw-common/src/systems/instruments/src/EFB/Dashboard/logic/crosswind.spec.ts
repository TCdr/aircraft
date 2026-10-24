// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { crosswindKt, crosswindLimit, crosswindSide } from './crosswind';

describe('crosswindKt', () => {
  it('uses the gust: 360/20G28 on a 270 degree runway is 28 kt', () => {
    expect(crosswindKt(360, 20, 28, 270)).toBe(28);
  });

  it('uses the steady wind when it is stronger than the gust value or no gust is given', () => {
    expect(crosswindKt(360, 20, null, 270)).toBe(20);
    expect(crosswindKt(360, 20, 15, 270)).toBe(20);
  });

  it('is zero for a direct headwind and half for 30 degrees off', () => {
    expect(crosswindKt(270, 20, null, 270)).toBe(0);
    expect(crosswindKt(300, 20, null, 270)).toBe(10);
  });

  it('is the same for left and right crosswind', () => {
    expect(crosswindKt(180, 20, null, 270)).toBe(20);
  });

  it('is null for variable wind (VRB05KT)', () => {
    expect(crosswindKt(null, 5, null, 270)).toBeNull();
  });

  it('is null for calm wind (00000KT)', () => {
    expect(crosswindKt(0, 0, null, 270)).toBeNull();
  });

  it('is null without a runway heading', () => {
    expect(crosswindKt(360, 20, null, null)).toBeNull();
  });
});

describe('crosswindLimit', () => {
  it('A32NX dry is the demonstrated value', () => {
    expect(crosswindLimit('a32nx', [])).toEqual({ limitKt: 38, kind: 'demonstrated' });
    expect(crosswindLimit('a32nx', ['BR', 'FG'])).toEqual({ limitKt: 38, kind: 'demonstrated' });
  });

  it('A32NX rain and drizzle: 29 kt recommended', () => {
    for (const group of ['RA', '-RA', 'DZ', '-SHRA', '+TSRA']) {
      expect(crosswindLimit('a32nx', [group])).toEqual({ limitKt: 29, kind: 'recommended' });
    }
  });

  it('A32NX snow: 25 kt recommended', () => {
    expect(crosswindLimit('a32nx', ['SN'])).toEqual({ limitKt: 25, kind: 'recommended' });
    expect(crosswindLimit('a32nx', ['-SG'])).toEqual({ limitKt: 25, kind: 'recommended' });
  });

  it('A32NX freezing or ice: 15 kt recommended, even when rain is also reported', () => {
    for (const group of ['FZRA', 'FZDZ', 'PL', 'IC']) {
      expect(crosswindLimit('a32nx', ['RA', group])).toEqual({ limitKt: 15, kind: 'recommended' });
    }
  });

  it('A380X is 30 kt certified whatever the weather', () => {
    expect(crosswindLimit('a380x', [])).toEqual({ limitKt: 30, kind: 'certified' });
    expect(crosswindLimit('a380x', ['FZRA'])).toEqual({ limitKt: 30, kind: 'certified' });
  });
});

describe('crosswindSide', () => {
  it('070 on runway 10 (100) blows from the left, on runway 28 (280) from the right', () => {
    expect(crosswindSide(70, 100)).toBe('left');
    expect(crosswindSide(70, 280)).toBe('right');
  });

  it('has no side for a variable wind or a wind straight along the runway', () => {
    expect(crosswindSide(null, 100)).toBeNull();
    expect(crosswindSide(100, 100)).toBeNull();
    expect(crosswindSide(280, 100)).toBeNull();
  });
});
