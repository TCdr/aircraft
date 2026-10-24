// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ceilingCategory, ceilingFt, flightCategory, visibilityCategory } from './flightCategory';
import { parseMetarReport } from './reportElements';
import { RJOA_METAR_LIFR, RJOA_METAR_VFR } from './rjoaFixtures';

describe('ceilingFt', () => {
  it('is the lowest broken, overcast or obscured layer, not a few or scattered one', () => {
    expect(ceilingFt(parseMetarReport(RJOA_METAR_VFR).clouds ?? [])).toBe(20000);
    expect(ceilingFt(parseMetarReport(RJOA_METAR_LIFR).clouds ?? [])).toBe(300);
    expect(ceilingFt([{ cover: 'VV', baseFt: 100, convective: null }])).toBe(100);
    expect(ceilingFt([{ cover: 'SCT', baseFt: 800, convective: null }])).toBeNull();
    expect(ceilingFt([])).toBeNull();
  });
});

describe('flight category, FAA limits', () => {
  it('ceiling: LIFR below 500, IFR below 1000, MVFR up to 3000 included', () => {
    expect(ceilingCategory(499)).toBe('LIFR');
    expect(ceilingCategory(500)).toBe('IFR');
    expect(ceilingCategory(999)).toBe('IFR');
    expect(ceilingCategory(1000)).toBe('MVFR');
    expect(ceilingCategory(3000)).toBe('MVFR');
    expect(ceilingCategory(3100)).toBe('VFR');
    expect(ceilingCategory(null)).toBe('VFR');
  });

  it('visibility with 1 SM = 1609 m: LIFR below 1 SM, IFR below 3 SM, MVFR up to 5 SM included', () => {
    expect(visibilityCategory(1608)).toBe('LIFR');
    expect(visibilityCategory(1609)).toBe('IFR');
    expect(visibilityCategory(4826)).toBe('IFR');
    expect(visibilityCategory(4827)).toBe('MVFR');
    expect(visibilityCategory(8045)).toBe('MVFR');
    expect(visibilityCategory(8046)).toBe('VFR');
  });

  it('takes the worse of the two: RJOA 1800Z is VFR with a 20,000 ft ceiling, 0400Z LIFR with 300 ft', () => {
    const vfr = parseMetarReport(RJOA_METAR_VFR);
    expect(flightCategory(ceilingFt(vfr.clouds ?? []), vfr.visibility?.metres)).toBe('VFR');
    const lifr = parseMetarReport(RJOA_METAR_LIFR);
    expect(flightCategory(ceilingFt(lifr.clouds ?? []), lifr.visibility?.metres)).toBe('LIFR');
    expect(flightCategory(1200, 6000)).toBe('MVFR');
    expect(flightCategory(null, 3000)).toBe('IFR');
  });

  it('has no category when neither ceiling nor visibility is reported', () => {
    expect(flightCategory(undefined, undefined)).toBeNull();
    expect(flightCategory(undefined, 10000)).toBe('VFR');
  });
});
