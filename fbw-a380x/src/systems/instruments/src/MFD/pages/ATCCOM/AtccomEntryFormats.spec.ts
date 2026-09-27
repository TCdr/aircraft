// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';

import {
  parseAtcAltitude,
  parseAtcDistance,
  parseAtcEndurance,
  parseAtcSat,
  parseAtcSquawk,
  parseAtcVerticalSpeed,
  parseAtcWind,
  parseAtcDegree,
  parseAtcFix,
  parseAtcFrequency,
  parseAtcOffset,
  parseAtcPositionOrTime,
  parseAtcSpeed,
  requestFieldFormat,
} from './AtccomEntryFormats';

describe('ATC COM entry formats (FCOM DSC-46-10-20-50)', () => {
  it('parses the altitudes', () => {
    expect(parseAtcAltitude('FL340')).toBe('FL340');
    expect(parseAtcAltitude('90')).toBe('FL090');
    expect(parseAtcAltitude('12000')).toBe('12000FT');
    expect(parseAtcAltitude('800FT')).toBe('800FT');
    expect(parseAtcAltitude('3000M')).toBe('3000M');
    expect(() => parseAtcAltitude('FL460')).toThrow();
    expect(() => parseAtcAltitude('26000')).toThrow();
    expect(() => parseAtcAltitude('ABC')).toThrow();
  });

  it('parses the positions and times', () => {
    expect(parseAtcFix('TADEX')).toBe('TADEX');
    expect(parseAtcFix('4530.5N/07330W')).toBe('4530.5N/07330.0W');
    expect(parseAtcFix('N4530/W7330')).toBe('4530.0N/07330.0W');
    expect(parseAtcPositionOrTime('1230')).toBe('1230Z');
    expect(parseAtcPositionOrTime('12H5MN')).toBe('1205Z');
    expect(parseAtcPositionOrTime('BERGI')).toBe('BERGI');
    expect(() => parseAtcPositionOrTime('2460')).toThrow();
  });

  it('parses the offsets, degrees, speeds and frequencies', () => {
    expect(parseAtcOffset('20L', false)).toBe('20NM L');
    expect(parseAtcOffset('R15KM', false)).toBe('15KM R');
    expect(parseAtcOffset('30LR', true)).toBe('30NM LR');
    expect(() => parseAtcOffset('30LR', false)).toThrow();
    expect(() => parseAtcOffset('129', false)).toThrow();
    expect(parseAtcDegree('360')).toBe('000');
    expect(parseAtcDegree('90T')).toBe('090T');
    expect(parseAtcSpeed('250')).toBe('250KT');
    expect(parseAtcSpeed('.8')).toBe('M.80');
    expect(() => parseAtcSpeed('M.95')).toThrow();
    expect(parseAtcFrequency('121.5')).toBe('121.500');
    expect(parseAtcFrequency('8891')).toBe('8891');
  });

  it('parses the position report entries', () => {
    expect(parseAtcWind('270/45')).toBe('270/45KT');
    expect(parseAtcWind('90°/20KM/H')).toBe('090/20KM/H');
    expect(() => parseAtcWind('0/20')).toThrow();
    expect(parseAtcSat('M40')).toBe('-40C');
    expect(parseAtcSat('15')).toBe('15C');
    expect(() => parseAtcSat('-90')).toThrow();
    expect(parseAtcVerticalSpeed('-1500')).toBe('-1500FT/MIN');
    expect(parseAtcVerticalSpeed('M500FTM')).toBe('-500FT/MIN');
    expect(parseAtcVerticalSpeed('300M')).toBe('300M/MIN');
    expect(parseAtcEndurance('0430')).toBe('4H30');
    expect(parseAtcEndurance('4H30MIN')).toBe('4H30');
    expect(parseAtcSquawk('7700')).toBe('7700');
    expect(() => parseAtcSquawk('7800')).toThrow();
    expect(parseAtcDistance('12.5')).toBe('12.5NM');
  });

  it('keeps the freetext spaces', async () => {
    expect(await requestFieldFormat('freetext').parse('DUE TO  CB')).toBe('DUE TO CB');
    expect(await requestFieldFormat('altitude').parse('FL 340')).toBe('FL340');
  });
});
