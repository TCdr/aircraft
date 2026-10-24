// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { skyRows, skyScaleTopFt, skyTicksFt, skyY } from './skyColumn';
import { CloudLayer } from './reportElements';

const layer = (
  cover: CloudLayer['cover'],
  baseFt: number,
  convective: CloudLayer['convective'] = null,
): CloudLayer => ({
  cover,
  baseFt,
  convective,
});

describe('skyScaleTopFt', () => {
  it('fits the scale to the highest layer with room above it', () => {
    expect(skyScaleTopFt([layer('BKN', 300)])).toBe(2000);
    expect(skyScaleTopFt([layer('FEW', 4800), layer('OVC', 21000)])).toBe(30000);
    expect(skyScaleTopFt([])).toBe(2000);
    expect(skyScaleTopFt([layer('BKN', 45000)])).toBe(50000);
  });

  it('ticks up to the top only', () => {
    expect(skyTicksFt(2000)).toEqual([0, 500, 1000, 2000]);
  });
});

describe('skyY', () => {
  it('puts the ground at the bottom, the top at the top, a quarter of the height at half the column', () => {
    expect(skyY(0, 4000, 0, 100)).toBe(100);
    expect(skyY(4000, 4000, 0, 100)).toBe(0);
    expect(skyY(1000, 4000, 0, 100)).toBe(50);
    expect(skyY(9000, 4000, 0, 100)).toBe(0);
  });
});

describe('skyRows', () => {
  it('joins layers at one height and keeps the thickest cover', () => {
    const rows = skyRows([layer('BKN', 300), layer('SCT', 300), layer('FEW', 0)], 2000, 0, 400, 40, 10);
    expect(rows.map((row) => [row.baseFt, row.covers, row.oktas])).toEqual([
      [0, ['FEW'], 2],
      [300, ['BKN', 'SCT'], 6],
    ]);
  });

  it('keeps the lowest bar off the ground and the next one a label height above', () => {
    const rows = skyRows([layer('FEW', 0), layer('SCT', 100, 'TCU')], 30000, 0, 400, 40, 10);
    expect(rows[0].barY).toBe(390);
    expect(rows[1].barY).toBe(350);
    expect(rows[1].covers).toEqual(['SCT TCU']);
  });

  it('leaves layers far apart at their own heights', () => {
    const rows = skyRows([layer('FEW', 500), layer('OVC', 2000)], 2000, 0, 400, 40, 10);
    expect(rows.map((row) => row.barY)).toEqual([200, 0]);
  });
});
