// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { expediteDescentSpeedTarget } from './ExpediteDescentSpeed';

describe('EXP DES speed target', () => {
  it('is 340 kt where M .80 is faster', () => {
    expect(expediteDescentSpeedTarget(() => 360)).toBe(340);
  });

  it('is M .80 where it is slower than 340 kt', () => {
    expect(expediteDescentSpeedTarget(() => 290)).toBe(290);
  });

  it('asks for the CAS of M .80', () => {
    const asked: number[] = [];
    expediteDescentSpeedTarget((mach) => {
      asked.push(mach);
      return 300;
    });
    expect(asked).toEqual([0.8]);
  });
});
