// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { findOccurrences, occurrencesText, stepOccurrence } from './FlightFolderTextSearch';

describe('document search', () => {
  it('finds every occurrence of every word, whatever the case', () => {
    expect(findOccurrences('RWY 16R closed. rwy 34L open', 'rwy')).toEqual([
      [0, 3],
      [16, 19],
    ]);
    expect(findOccurrences('ILS out, RWY closed', 'ils rwy')).toEqual([
      [0, 3],
      [9, 12],
    ]);
  });

  it('finds nothing for an empty field or a missing word', () => {
    expect(findOccurrences('RWY 16R', '  ')).toEqual([]);
    expect(findOccurrences('RWY 16R', 'taxiway')).toEqual([]);
  });

  it('goes round the occurrences with < and >', () => {
    expect(stepOccurrence(null, 3, 1)).toBe(0);
    expect(stepOccurrence(null, 3, -1)).toBe(2);
    expect(stepOccurrence(2, 3, 1)).toBe(0);
    expect(stepOccurrence(0, 3, -1)).toBe(2);
    expect(stepOccurrence(null, 0, 1)).toBeNull();
  });

  it('counts the occurrences', () => {
    expect(occurrencesText(0)).toBe('0 occurrences found');
    expect(occurrencesText(1)).toBe('1 occurrence found');
    expect(occurrencesText(4)).toBe('4 occurrences found');
  });
});
