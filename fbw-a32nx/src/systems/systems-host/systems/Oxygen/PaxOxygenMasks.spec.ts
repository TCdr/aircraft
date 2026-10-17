// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { PAX_MASK_RELEASE_CABIN_ALTITUDE_FT, isPaxMaskAutoRelease } from './PaxOxygenMasks';

/* The mask containers open when the cabin pressure altitude exceeds 14 000 ft (+250, -750 ft) */
describe('passenger oxygen masks automatic release', () => {
  it('drops the masks when the cabin altitude goes above 14 000 ft', () => {
    expect(PAX_MASK_RELEASE_CABIN_ALTITUDE_FT).toBe(14_000);
    expect(isPaxMaskAutoRelease(13_900, 14_100)).toBe(true);
  });

  it('not below 14 000 ft', () => {
    expect(isPaxMaskAutoRelease(13_000, 13_999)).toBe(false);
  });

  it('once only: the crew can reset the masks in a cabin that stays above 14 000 ft', () => {
    expect(isPaxMaskAutoRelease(14_100, 14_200)).toBe(false);
  });

  it('not at the first update (a flight loaded on an airfield above 14 000 ft)', () => {
    expect(isPaxMaskAutoRelease(null, 14_500)).toBe(false);
  });

  it('runs in the systems host', () => {
    const host = readFileSync(resolve(__dirname, '../../index.ts'), 'utf-8');
    expect(host).toContain("this.backplane.addInstrument('PaxOxygenMasks', new PaxOxygenMasks());");
  });
});
