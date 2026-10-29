// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { OpsLibraryUserData, TRACE_LENGTH } from './OpsLibraryUserData';

/**
 * @param initial the text the store holds
 * @returns a store in memory and the box that holds its text
 */
function memoryStorage(initial = '') {
  const box = { text: initial };
  return {
    box,
    storage: {
      read: () => box.text,
      write: (t: string) => {
        box.text = t;
      },
    },
  };
}

describe('OpsLibraryUserData bookmarks', () => {
  it('adds a unit once, deletes it and clears the list', () => {
    const data = new OpsLibraryUserData(memoryStorage().storage);
    data.addBookmark('a');
    data.addBookmark('a');
    data.addBookmark('b');
    expect(data.bookmarkIds()).toEqual(['a', 'b']);
    data.deleteBookmark('a');
    expect(data.bookmarkIds()).toEqual(['b']);
    data.clearBookmarks();
    expect(data.bookmarkIds()).toEqual([]);
  });

  it('keeps bookmarks, notes and checks in the store and reads them back', () => {
    const { storage, box } = memoryStorage();
    const first = new OpsLibraryUserData(storage);
    first.addBookmark('a');
    first.notes.save('a', 'my note');
    first.recordCheck('feature', { result: 'success', date: 1000 });
    const second = new OpsLibraryUserData({ read: () => box.text, write: () => {} });
    expect(second.bookmarkIds()).toEqual(['a']);
    expect(second.notes.get('a')).toBe('my note');
    expect(second.checkOf('feature')).toEqual({ result: 'success', date: 1000 });
  });

  it('starts empty on a damaged or foreign store', () => {
    for (const text of ['', 'not json', '{"version":2,"bookmarks":["a"]}', '[1]']) {
      expect(new OpsLibraryUserData(memoryStorage(text).storage).bookmarkIds()).toEqual([]);
    }
  });

  it('drops damaged entries and keeps the good ones', () => {
    const text = JSON.stringify({
      version: 1,
      bookmarks: ['a', 5],
      notes: { a: 'n', b: 3 },
      checks: { m: { result: 'bad', date: 1 }, n: { result: 'failed', date: 2 } },
    });
    const data = new OpsLibraryUserData(memoryStorage(text).storage);
    expect(data.bookmarkIds()).toEqual(['a']);
    expect(data.notes.unitIds()).toEqual(['a']);
    expect(data.checkOf('m')).toBeNull();
    expect(data.checkOf('n')?.result).toBe('failed');
  });
});

describe('OpsLibraryUserData folders', () => {
  it('has Trace, Interruption, Airline and Pilot, the Airline folder empty', () => {
    const data = new OpsLibraryUserData(memoryStorage().storage);
    data.addBookmark('p');
    data.setInterruption('i');
    data.recordVisit('t');
    expect(data.folders().map((f) => [f.name, f.unitIds])).toEqual([
      ['Trace', ['t']],
      ['Interruption', ['i']],
      ['Airline', []],
      ['Pilot', ['p']],
    ]);
  });

  it('puts the last visit first without a repeat and keeps the last units only', () => {
    const data = new OpsLibraryUserData(memoryStorage().storage);
    for (let i = 0; i < TRACE_LENGTH + 5; i++) {
      data.recordVisit(`u${i}`);
    }
    data.recordVisit('u10');
    const trace = data.folders()[0].unitIds;
    expect(trace).toHaveLength(TRACE_LENGTH);
    expect(trace[0]).toBe('u10');
    expect(trace.filter((id) => id === 'u10')).toHaveLength(1);
  });

  it('does not store the Trace or the Interruption', () => {
    const { storage, box } = memoryStorage();
    const data = new OpsLibraryUserData(storage);
    data.recordVisit('trace-unit');
    data.setInterruption('interrupted-unit');
    data.addBookmark('p');
    expect(box.text).not.toContain('trace-unit');
    expect(box.text).not.toContain('interrupted-unit');
  });

  it('counts the changes for the views', () => {
    const data = new OpsLibraryUserData(memoryStorage().storage);
    const before = data.version.get();
    data.addBookmark('a');
    expect(data.version.get()).toBeGreaterThan(before);
  });
});
