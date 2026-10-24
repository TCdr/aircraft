// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { a320RefuelMinutes, a380RefuelMinutes } from './refuelMinutes';

describe('a320RefuelMinutes', () => {
  const slow = { instantOrAtTarget: false, fastRate: false };

  it('is zero when instant or at the target', () => {
    expect(
      a320RefuelMinutes({ ...slow, instantOrAtTarget: true, wingDifferenceGallons: 900, centerDifferenceGallons: 0 }),
    ).toBe(0);
  });

  it('takes the slower of the wings and the centre tank', () => {
    // Full wings take 1020 s = 17 min, the full centre tank 1200 s = 20 min
    expect(a320RefuelMinutes({ ...slow, wingDifferenceGallons: 4088, centerDifferenceGallons: 0 })).toBe(17);
    expect(a320RefuelMinutes({ ...slow, wingDifferenceGallons: 0, centerDifferenceGallons: 2179 })).toBe(20);
  });

  it('is five times shorter at the fast rate', () => {
    expect(
      a320RefuelMinutes({
        instantOrAtTarget: false,
        fastRate: true,
        wingDifferenceGallons: 0,
        centerDifferenceGallons: 2179,
      }),
    ).toBe(4);
  });

  it('shows half a minute for a short top-up', () => {
    expect(a320RefuelMinutes({ ...slow, wingDifferenceGallons: 100, centerDifferenceGallons: 0 })).toBe(0.5);
  });
});

describe('a380RefuelMinutes', () => {
  it('divides the gallons by the flow of 16 gallons per second', () => {
    expect(a380RefuelMinutes({ instantOrAtTarget: false, fastRate: false, differenceGallons: 9600 })).toBe(10);
    expect(a380RefuelMinutes({ instantOrAtTarget: false, fastRate: true, differenceGallons: 48000 })).toBe(10);
  });

  it('is zero when instant and half a minute for a short top-up', () => {
    expect(a380RefuelMinutes({ instantOrAtTarget: true, fastRate: false, differenceGallons: 9600 })).toBe(0);
    expect(a380RefuelMinutes({ instantOrAtTarget: false, fastRate: false, differenceGallons: 160 })).toBe(0.5);
  });
});
