// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { atisListLines, atisTime, wrapAtisText } from './AtisText';

describe('ATIS message area', () => {
  it('wraps the words in lines of the given lengths', () => {
    expect(wrapAtisText('AAA BBB CCC', [7, 7])).toEqual({ lines: ['AAA BBB', 'CCC'], rest: '' });
    expect(wrapAtisText('AAA BBB CCC DDD', [7, 3])).toEqual({ lines: ['AAA BBB', 'CCC'], rest: 'DDD' });
  });

  it('keeps a short ATIS whole', () => {
    const { lines, truncated } = atisListLines('LFBO DEP ATIS R 1145Z EXP ARR RWY 32R');
    expect(truncated).toBe(false);
    expect(lines).toEqual(['LFBO DEP ATIS R 1145Z EXP ARR RWY 32R', '', '', '', '']);
  });

  it('puts dots instead of the last 9 characters of a long ATIS (FCOM DSC-46-10-20-30 P 34)', () => {
    const text = Array.from({ length: 60 }, (_, i) => `W${i.toString().padStart(2, '0')}`).join(' ');
    const { lines, truncated } = atisListLines(text);
    expect(truncated).toBe(true);
    expect(lines.slice(0, 4).every((line) => line.length <= 44)).toBe(true);
    expect(lines[4].endsWith(' ......')).toBe(true);
    expect(lines[4].length).toBeLessThanOrEqual(39);
  });
});

describe('ATIS time indication (FCOM DSC-46-10-20-30 P 31)', () => {
  it('is the time written in the ATIS, not the time of reception', () => {
    expect(atisTime('JFK ATIS INFO O 1151Z. 05027G40KT 7SM -RA OVC014')).toBe('1151Z');
    expect(atisTime('lfbo dep atis r 1145z exp arr rwy 32r')).toBe('1145Z');
  });

  it('skips a group that is not a time', () => {
    expect(atisTime('ATIS B 2575Z WIND 1230Z')).toBe('1230Z');
  });

  it('is ---- when the ATIS has no time', () => {
    expect(atisTime('D-ATIS NOT AVAILABLE')).toBe('----');
    expect(atisTime('RWY 04L12Z')).toBe('----');
  });
});
