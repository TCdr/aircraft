// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  DocumentSearchIndex,
  SEARCH_HIT_WARNING_LIMIT,
  groupHitsByDocument,
  highlightRanges,
  parseSearchQuery,
} from './DocumentSearch';

const entries = [
  { id: 'a', group: 'M1', title: 'APU START', text: 'The APU starts from the OIS panel.' },
  { id: 'b', group: 'M1', title: 'OIS HOME', text: 'Open the library. Nothing else.' },
  { id: 'c', group: 'M2', title: 'ENGINE', text: 'Fuel flow and APU bleed.' },
];

const ids = (query: string) => {
  const parsed = parseSearchQuery(query);
  return parsed === null ? null : new DocumentSearchIndex(entries).search(parsed).hits.map((h) => h.id);
};

describe('parseSearchQuery', () => {
  it('has no query for an empty field or only operators', () => {
    expect(parseSearchQuery('   ')).toBeNull();
    expect(parseSearchQuery('and or')).toBeNull();
  });

  it('puts words without an operator in separate alternatives', () => {
    expect(parseSearchQuery('apu fuel')?.groups).toEqual([
      [{ text: 'apu', phrase: false }],
      [{ text: 'fuel', phrase: false }],
    ]);
  });

  it('binds and before or', () => {
    const groups = parseSearchQuery('apu AND ois or fuel')?.groups;
    expect(groups?.map((g) => g.map((t) => t.text))).toEqual([['apu', 'ois'], ['fuel']]);
  });

  it('keeps a quoted phrase as one term, and a quoted operator as a word', () => {
    expect(parseSearchQuery('"fuel flow" "and"')?.groups.map((g) => g.map((t) => [t.text, t.phrase]))).toEqual([
      [['fuel flow', true]],
      [['and', true]],
    ]);
  });
});

describe('DocumentSearchIndex', () => {
  it('finds at least one of the words, ignoring case', () => {
    expect(ids('FUEL ois')).toEqual(['a', 'b', 'c']);
  });

  it('and needs both words', () => {
    expect(ids('apu and ois')).toEqual(['a']);
    expect(ids('apu and fuel')).toEqual(['c']);
  });

  it('finds a phrase only when the words are together', () => {
    expect(ids('"fuel flow"')).toEqual(['c']);
    expect(ids('"flow fuel"')).toEqual([]);
  });

  it('searches the title too', () => {
    expect(ids('engine')).toEqual(['c']);
  });

  it('flags more hits than the warning limit', () => {
    const many = Array.from({ length: SEARCH_HIT_WARNING_LIMIT + 1 }, (_, i) => ({
      id: `u${i}`,
      group: 'M',
      title: 'T',
      text: 'word',
    }));
    const index = new DocumentSearchIndex(many);
    expect(index.search(parseSearchQuery('word')!).tooMany).toBe(true);
    expect(new DocumentSearchIndex(many.slice(1)).search(parseSearchQuery('word')!).tooMany).toBe(false);
  });

  it('groups the hits by document', () => {
    const result = new DocumentSearchIndex(entries).search(parseSearchQuery('apu')!);
    expect(groupHitsByDocument(result.hits).map((g) => [g.group, g.hits.length])).toEqual([
      ['M1', 1],
      ['M2', 1],
    ]);
  });
});

describe('highlightRanges', () => {
  it('marks every occurrence, ignoring case, and merges overlaps', () => {
    const query = parseSearchQuery('apu "apu starts"')!;
    expect(highlightRanges('The APU starts. APU.', query)).toEqual([
      [4, 14],
      [16, 19],
    ]);
  });

  it('has no range without a match', () => {
    expect(highlightRanges('nothing', parseSearchQuery('apu')!)).toEqual([]);
  });
});
