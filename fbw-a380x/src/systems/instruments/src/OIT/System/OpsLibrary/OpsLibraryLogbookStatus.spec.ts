// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  LogbookDeferralCategory,
  LogbookItem,
  LogbookItemState,
  TechLogbookState,
  createTechLogbook,
} from '../TechLogbook';
import { EMPTY_AIRCRAFT_STATUS } from '../Performance/AircraftStatus';
import {
  isItemTicked,
  logbookStatusRows,
  mmelReferencesOf,
  openItemsText,
  setItemTicked,
} from './OpsLibraryLogbookStatus';

/**
 * @param ref the report reference of the item
 * @param state the state
 * @param deferral the deferral
 * @returns the item
 */
function item(
  ref: string,
  state: LogbookItemState,
  deferral: { category: LogbookDeferralCategory; reference: string } | null = null,
): LogbookItem {
  return {
    ref,
    title: `TITLE ${ref}`,
    ata: '21-51-00',
    state,
    openDate: 0,
    closeDate: null,
    pilotComment: '',
    cabinComment: '',
    additionalInfo: '',
    lastMaintAction: '',
    sendStatus: 'sent',
    flightIndex: 1,
    ecamAlertId: null,
    deferral:
      deferral === null
        ? null
        : {
            category: deferral.category,
            classification: 'MEL',
            reference: deferral.reference,
            expiryDate: null,
            rectificationInterval: 'C',
            severity: '',
          },
  };
}

const logbook = (items: LogbookItem[]): TechLogbookState => ({ ...createTechLogbook(), items });

describe('logbookStatusRows', () => {
  const rows = logbookStatusRows(
    logbook([
      item('o1', 'open'),
      item('o2', 'open'),
      item('m1', 'deferred', { category: 'MEL', reference: '21-51-01' }),
      item('c1', 'deferred', { category: 'CDL', reference: '57-51-01' }),
      item('x1', 'deferred', { category: 'OTHER', reference: '' }),
      item('t1', 'temporary'),
    ]),
  );

  it('counts the open items', () => {
    expect(rows.openItems).toBe(2);
    expect(openItemsText(2)).toBe('OPEN ITEMS: 2');
    expect(openItemsText(0)).toBe('OPEN ITEMS: NONE');
  });

  it('splits the deferred items into MEL and CDL tables, other deferrals are not listed', () => {
    expect(rows.mel.map((r) => r.ref)).toEqual(['m1']);
    expect(rows.cdl.map((r) => r.ref)).toEqual(['c1']);
  });

  it('shows the report title and the proposed item with its reference', () => {
    expect(rows.mel[0]).toMatchObject({ report: 'TITLE m1', proposedItem: '21-51-01 TITLE m1' });
  });

  it('an item without a reference has no proposed item to link', () => {
    const noReference = logbookStatusRows(logbook([item('m2', 'deferred', { category: 'MEL', reference: '' })]));
    expect(noReference.mel[0].proposedItem).toBe('');
    expect(mmelReferencesOf(noReference)).toEqual([]);
  });

  it('has nothing without an eLogbook', () => {
    expect(logbookStatusRows(null)).toEqual({ openItems: 0, mel: [], cdl: [] });
  });

  it('lists the references of the deferred items for the MMEL', () => {
    expect(mmelReferencesOf(rows)).toEqual([
      { reference: '21-51-01', title: 'TITLE m1' },
      { reference: '57-51-01', title: 'TITLE c1' },
    ]);
  });
});

describe('the tick box of an MMEL entry', () => {
  const row = logbookStatusRows(logbook([item('m1', 'deferred', { category: 'MEL', reference: '21-51-01' })])).mel[0];

  it('ticking puts the item in the aircraft status, unticking takes it out', () => {
    const ticked = setItemTicked(EMPTY_AIRCRAFT_STATUS, row, 'MEL', true);
    expect(ticked.melItems.map((i) => i.reference)).toEqual(['21-51-01']);
    expect(isItemTicked(ticked, '21-51-01')).toBe(true);
    const unticked = setItemTicked(ticked, row, 'MEL', false);
    expect(unticked.melItems).toEqual([]);
    expect(isItemTicked(unticked, '21-51-01')).toBe(false);
  });

  it('ticking twice does not repeat the item', () => {
    const twice = setItemTicked(setItemTicked(EMPTY_AIRCRAFT_STATUS, row, 'MEL', true), row, 'MEL', true);
    expect(twice.melItems).toHaveLength(1);
  });

  it('a CDL item goes in the CDL list and the other entries of the status stay', () => {
    const base = { ...EMPTY_AIRCRAFT_STATUS, negligibleCdlItems: 3 };
    const ticked = setItemTicked(base, row, 'CDL', true);
    expect(ticked.cdlItems).toHaveLength(1);
    expect(ticked.negligibleCdlItems).toBe(3);
  });

  it('works on the aircraft status only: the logbook is untouched', () => {
    const state = logbook([item('m1', 'deferred', { category: 'MEL', reference: '21-51-01' })]);
    const before = JSON.stringify(state);
    setItemTicked(EMPTY_AIRCRAFT_STATUS, row, 'MEL', true);
    expect(JSON.stringify(state)).toBe(before);
  });
});
