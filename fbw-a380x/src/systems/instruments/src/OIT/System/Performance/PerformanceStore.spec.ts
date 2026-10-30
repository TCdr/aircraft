// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import { FlightFolder } from '../FlightFolder';
import { flightFolderFromOfp } from '../FlightFolderSession';
import { testOfp } from '../FlightFolderTestOfp';
import { PerformanceStoreTarget, storeAndAnnounce, storeAvailability, storePage } from './PerformanceStore';

/**
 * @param folder the current EFF, null when there is none
 * @returns the FLT FOLDER session part STORE uses, on that folder
 */
function targetOf(folder: FlightFolder | null): PerformanceStoreTarget {
  return {
    storeAvailable: Subject.create(folder !== null && !folder.closed),
    store: (code, text) => folder?.store(code, text) ?? null,
  };
}

const LANDING = { title: 'LDG PERF', text: 'LANDING PAGE' };

describe('STORE of a performance page', () => {
  it('names the document after the application and counts per application', () => {
    const folder = flightFolderFromOfp(testOfp(), true);
    const target = targetOf(folder);
    expect(storePage(target, 'LDPA', LANDING)).toBe('LDG PERF');
    expect(storePage(target, 'LDPA', LANDING)).toBe('LDG PERF');
    expect(storePage(target, 'TOPA', { title: 'T.O PERF', text: 'T.O PAGE' })).toBe('T.O PERF');
    const names = folder
      .visibleTree()
      .find((node) => node.name === 'Performance')
      ?.children?.map((node) => node.name);
    expect(names).toEqual(['LDPA_1', 'LDPA_2', 'TOPA_1']);
    expect(folder.document('performance/LDPA_2')?.text).toBe('LANDING PAGE');
  });

  it('shows (NEW) on the document and its folder until the document is read', () => {
    const folder = flightFolderFromOfp(testOfp(), true);
    storePage(targetOf(folder), 'WBA', { title: 'LOADSHEET', text: 'LOADSHEET TEXT' });
    const performance = folder.visibleTree().find((node) => node.name === 'Performance')!;
    expect(folder.isNew(performance)).toBe(true);
    expect(folder.isNew(performance.children![0])).toBe(true);
    folder.markRead('performance/WBA_1');
    expect(folder.isNew(performance)).toBe(false);
  });

  it('stores nothing without a current open EFF or without a printout', () => {
    expect(storePage(targetOf(null), 'LDPA', LANDING)).toBeNull();
    const closed = flightFolderFromOfp(testOfp(), true);
    closed.close();
    expect(storePage(targetOf(closed), 'LDPA', LANDING)).toBeNull();
    const open = flightFolderFromOfp(testOfp(), true);
    expect(storePage(targetOf(open), 'LDPA', null)).toBeNull();
    expect(open.visibleTree().some((node) => node.name === 'Performance')).toBe(false);
  });

  it('does not call the folder while STORE is not available, whatever the folder would do', () => {
    const store = vi.fn(() => 'LDPA_1');
    expect(storePage({ storeAvailable: Subject.create(false), store }, 'LDPA', LANDING)).toBeNull();
    expect(store).not.toHaveBeenCalled();
  });

  it('opens the pop-up with the application name only when a document was stored', () => {
    const popupTitle = Subject.create<string | null>(null);
    storeAndAnnounce(targetOf(null), 'LDPA', LANDING, popupTitle);
    expect(popupTitle.get()).toBeNull();
    storeAndAnnounce(targetOf(flightFolderFromOfp(testOfp(), true)), 'LDPA', LANDING, popupTitle);
    expect(popupTitle.get()).toBe('LDG PERF');
  });

  it('is available when the page has results and the current EFF is open', () => {
    const results = Subject.create(false);
    const folderOpen = Subject.create(false);
    const available = storeAvailability(
      { storeAvailable: folderOpen, store: () => null },
      results,
      Subject.create(null),
    );
    expect(available.get()).toBe(false);
    results.set(true);
    expect(available.get()).toBe(false);
    folderOpen.set(true);
    expect(available.get()).toBe(true);
    results.set(false);
    expect(available.get()).toBe(false);
  });

  it('is not available while the pop-up of the last STORE is open, and stores nothing then', () => {
    const popupTitle = Subject.create<string | null>(null);
    const folder = flightFolderFromOfp(testOfp(), true);
    const target = targetOf(folder);
    const available = storeAvailability(target, Subject.create(true), popupTitle);
    expect(available.get()).toBe(true);

    storeAndAnnounce(target, 'LDPA', LANDING, popupTitle);
    expect(available.get()).toBe(false);
    storeAndAnnounce(target, 'LDPA', LANDING, popupTitle);
    expect(folder.document('performance/LDPA_2')).toBeNull();

    popupTitle.set(null);
    expect(available.get()).toBe(true);
    storeAndAnnounce(target, 'LDPA', LANDING, popupTitle);
    expect(folder.document('performance/LDPA_2')?.text).toBe('LANDING PAGE');
  });
});
