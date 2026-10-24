// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { checklistPreview, checklistProgress } from './checklistPreview';

// The A32NX APPROACH checklist as the aircraft's checklist file has it
const approach = {
  items: [
    { item: 'BARO REF', result: '_____SET (BOTH)' },
    { item: 'SEAT BELTS', result: 'ON' },
    { item: 'MINIMUM', result: 'AS RQRD' },
    { item: 'AUTO BRAKE', result: 'AS RQRD' },
    { item: 'ENG MODE SEL', result: 'AS RQRD' },
  ],
};

describe('checklistPreview', () => {
  it('lists the first items with their expected result', () => {
    expect(checklistPreview(approach, 3)).toEqual([
      { item: 'BARO REF', result: '_____SET (BOTH)' },
      { item: 'SEAT BELTS', result: 'ON' },
      { item: 'MINIMUM', result: 'AS RQRD' },
    ]);
    expect(checklistPreview(approach, 10)).toHaveLength(5);
  });

  it('skips separators and sub-list titles but keeps sub-list items', () => {
    const withSublist = {
      items: [
        { item: 'SIGNS', result: 'ON' },
        { type: 'LINE', item: '', result: '' },
        { type: 'SUBLISTHEADER', item: 'CABIN', result: '' },
        { type: 'SUBLISTITEM', item: 'SPOILERS', result: 'ARM' },
      ],
    };
    expect(checklistPreview(withSublist, 5).map((line) => line.item)).toEqual(['SIGNS', 'SPOILERS']);
  });

  it('shows the action when the result is empty', () => {
    expect(checklistPreview({ items: [{ item: 'FCU ALT', action: '____', result: '' }] }, 1)).toEqual([
      { item: 'FCU ALT', result: '____' },
    ]);
  });

  it('is empty without a checklist or without room', () => {
    expect(checklistPreview(undefined, 5)).toEqual([]);
    expect(checklistPreview(approach, 0)).toEqual([]);
  });
});

describe('checklistProgress', () => {
  it('counts the checklists marked complete', () => {
    expect(
      checklistProgress([{ markedCompleted: true }, { markedCompleted: false }, { markedCompleted: true }]),
    ).toEqual({ done: 2, total: 3 });
    expect(checklistProgress([])).toEqual({ done: 0, total: 0 });
  });
});
