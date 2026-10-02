// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { checklistMarkKind, firstRelevantUnmarkedChecklist } from './checklistMark';

const checklists = (...marked: boolean[]) => marked.map((markedCompleted) => ({ markedCompleted }));

describe('firstRelevantUnmarkedChecklist', () => {
  it('is the first checklist of the flight phase that is not marked complete', () => {
    expect(firstRelevantUnmarkedChecklist(checklists(false, true, false, false), [1, 2, 3])).toBe(2);
  });

  it('skips the checklists of other flight phases, even unmarked', () => {
    expect(firstRelevantUnmarkedChecklist(checklists(false, false, false), [2])).toBe(2);
  });

  it('is -1 when every checklist of the flight phase is marked complete', () => {
    expect(firstRelevantUnmarkedChecklist(checklists(false, true, true), [1, 2])).toBe(-1);
  });

  it('is -1 without a checklist for the flight phase', () => {
    expect(firstRelevantUnmarkedChecklist(checklists(false, false), [])).toBe(-1);
  });
});

describe('checklistMarkKind', () => {
  it('is done when marked complete, whatever the autofill and the flight phase', () => {
    expect(checklistMarkKind(true, false, 0, -1)).toBe('done');
    expect(checklistMarkKind(true, true, 0, 0)).toBe('done');
    expect(checklistMarkKind(true, true, 4, 1)).toBe('done');
  });

  it('is next for the next checklist to do when autofill is on', () => {
    expect(checklistMarkKind(false, true, 2, 2)).toBe('next');
  });

  it('is open for the next checklist to do when autofill is off', () => {
    expect(checklistMarkKind(false, false, 2, 2)).toBe('open');
  });

  it('is open for the other checklists', () => {
    expect(checklistMarkKind(false, true, 3, 2)).toBe('open');
    expect(checklistMarkKind(false, true, 0, -1)).toBe('open');
  });
});
