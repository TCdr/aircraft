// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { failureMatchesSearch, groupByChapter, resolveSelection, splitAtQuery } from './failuresView';

const xBleedStuckOpen = { ata: 36, identifier: 36010, name: 'X BLEED valve stuck open' };
const cabinFan1 = { ata: 21, identifier: 21020, name: 'Cabin Fan 1' };
const cabinFan2 = { ata: 21, identifier: 21021, name: 'Cabin Fan 2' };
const fadecBleedStatus = { ata: 73, identifier: 73001, name: 'Engine 1 bleed valve status to FADEC' };

describe('failureMatchesSearch', () => {
  it('matches everything without a query', () => {
    expect(failureMatchesSearch(cabinFan1, '', 'Air Conditioning')).toBe(true);
  });

  it('matches the name whatever its case', () => {
    expect(failureMatchesSearch(fadecBleedStatus, 'BLEED', 'Engine - Fuel And Control')).toBe(true);
  });

  it('matches the identifier and the chapter title', () => {
    expect(failureMatchesSearch(cabinFan1, '21020', 'Air Conditioning')).toBe(true);
    expect(failureMatchesSearch(cabinFan1, 'CONDITIONING', 'Air Conditioning')).toBe(true);
  });

  it('rejects a failure that matches nowhere', () => {
    expect(failureMatchesSearch(cabinFan1, 'BLEED', 'Air Conditioning')).toBe(false);
  });
});

describe('groupByChapter', () => {
  it('sorts the chapters in ATA order and keeps the list order inside a chapter', () => {
    const groups = groupByChapter([xBleedStuckOpen, cabinFan2, fadecBleedStatus, cabinFan1]);
    expect(groups.map((group) => group.ata)).toEqual([21, 36, 73]);
    expect(groups[0].failures).toEqual([cabinFan2, cabinFan1]);
  });
});

describe('resolveSelection', () => {
  it('keeps a chapter that is shown', () => {
    expect(resolveSelection(36, false, [21, 36], 0)).toBe(36);
  });

  it('opens the active failures by default when something is failed, else the first chapter', () => {
    expect(resolveSelection(null, false, [21, 36], 2)).toBe('active');
    expect(resolveSelection(null, false, [21, 36], 0)).toBe(21);
  });

  it('keeps the active failures list open even when it is empty', () => {
    expect(resolveSelection('active', false, [21, 36], 0)).toBe('active');
  });

  it('leaves the search results once the search is cleared', () => {
    expect(resolveSelection('results', false, [21, 36], 0)).toBe(21);
  });

  it('shows all the results while searching unless a chapter with matches is picked', () => {
    expect(resolveSelection('active', true, [36, 73], 1)).toBe('results');
    expect(resolveSelection(21, true, [36, 73], 1)).toBe('results');
    expect(resolveSelection(73, true, [36, 73], 1)).toBe(73);
  });
});

describe('splitAtQuery', () => {
  it('splits the name around the first match, keeping the case of the name', () => {
    expect(splitAtQuery('Engine 1 bleed valve', 'BLEED')).toEqual(['Engine 1 ', 'bleed', ' valve']);
  });

  it('returns null without a query or a match', () => {
    expect(splitAtQuery('Cabin Fan 1', '')).toBeNull();
    expect(splitAtQuery('Cabin Fan 1', 'BLEED')).toBeNull();
  });
});
