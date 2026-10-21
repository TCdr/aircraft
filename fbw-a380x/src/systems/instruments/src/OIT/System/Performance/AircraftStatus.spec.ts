// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { LogbookDeferralCategory, LogbookItem, TechLogbookState, createTechLogbook } from '../TechLogbook';
import {
  EMPTY_AIRCRAFT_STATUS,
  aircraftStatusFromLogbook,
  deleteAircraftStatusItem,
  itemsNotInComputation,
  reminderLines,
} from './AircraftStatus';

/**
 * @param ref the report reference
 * @param ata the ATA reference
 * @param title the title
 * @param category MEL, CDL or OTHER
 * @returns a deferred item of the eLogbook
 */
function deferred(ref: string, ata: string, title: string, category: LogbookDeferralCategory): LogbookItem {
  return {
    ref,
    title,
    ata,
    state: 'deferred',
    openDate: 0,
    closeDate: null,
    pilotComment: '',
    cabinComment: '',
    additionalInfo: '',
    lastMaintAction: '',
    sendStatus: 'sent',
    flightIndex: 0,
    ecamAlertId: null,
    deferral: {
      category,
      classification: category,
      reference: category === 'OTHER' ? '' : `${ata.substring(0, 5)}-01`,
      expiryDate: null,
      rectificationInterval: '',
      severity: 'LOW',
    },
  };
}

/**
 * @param items the items
 * @returns an eLogbook with the items
 */
function logbookWith(items: LogbookItem[]): TechLogbookState {
  return { ...createTechLogbook(), items };
}

const LOGBOOK = logbookWith([
  deferred('R1', '21-51-00', 'PACK 1 INOP', 'MEL'),
  deferred('R2', '34-11-00', 'ADIRU 3 INOP', 'MEL'),
  deferred('R3', '28-21-00', 'TRIM TK PUMP INOP', 'MEL'),
  deferred('R4', '52-41-00', 'AFT CARGO DOOR ACCESS PANEL', 'CDL'),
  deferred('R5', '23-61-00', 'STATIC DISCHARGER', 'CDL'),
  deferred('R6', '25-21-00', 'SEAT 12A', 'OTHER'),
  { ...deferred('R7', '30-11-00', 'WING A-ICE VALVE', 'MEL'), state: 'open' },
]);

describe('AIRCRAFT STATUS', () => {
  it('takes the deferred MEL and CDL items of the eLogbook, the static dischargers as negligible items', () => {
    const status = aircraftStatusFromLogbook(LOGBOOK);
    expect(status.melItems.map((i) => i.ref)).toEqual(['R1', 'R2', 'R3']);
    expect(status.cdlItems.map((i) => i.ref)).toEqual(['R4']);
    expect(status.negligibleCdlItems).toBe(1);
    expect(status.negligibleCdlItemsByCrew).toBe(false);
  });

  it('lists in each application the items that affect it and counts the others', () => {
    const status = aircraftStatusFromLogbook(LOGBOOK);
    expect(reminderLines(status, 'T.O PERF').map((l) => l.text)).toEqual([
      'MEL ITEMS',
      '21-51-01 PACK 1 INOP',
      '2 MEL ITEMS WITH NO PERFORMANCE IMPACT',
      'CDL ITEMS',
      '52-41-01 AFT CARGO DOOR ACCESS PANEL (1 MISSING)',
      '1 NEGLIGIBLE CDL ITEM',
    ]);
    expect(reminderLines(status, 'LOADSHEET').map((l) => l.text)).toEqual([
      'MEL ITEMS',
      '28-21-01 TRIM TK PUMP INOP',
      '2 MEL ITEMS WITH NO IMPACT',
    ]);
  });

  it('shows NO PERFORMANCE IMPACT or NORMAL without deferred items', () => {
    expect(reminderLines(EMPTY_AIRCRAFT_STATUS, 'LDG PERF').map((l) => l.text)).toEqual(['NO PERFORMANCE IMPACT']);
    expect(reminderLines(EMPTY_AIRCRAFT_STATUS, 'LOADSHEET').map((l) => l.text)).toEqual(['NORMAL']);
  });

  it('lists what the computation cannot take into account', () => {
    const status = aircraftStatusFromLogbook(LOGBOOK);
    expect(itemsNotInComputation(status, 'T.O PERF')).toEqual([
      '21-51-01 PACK 1 INOP',
      '52-41-01 AFT CARGO DOOR ACCESS PANEL',
    ]);
    expect(itemsNotInComputation(status, 'LOADSHEET')).toEqual(['28-21-01 TRIM TK PUMP INOP']);
    // Up to three negligible items have no penalty, from the fourth one they add drag
    expect(itemsNotInComputation({ ...EMPTY_AIRCRAFT_STATUS, negligibleCdlItems: 3 }, 'LDG PERF')).toEqual([]);
    expect(itemsNotInComputation({ ...EMPTY_AIRCRAFT_STATUS, negligibleCdlItems: 4 }, 'LDG PERF')).toEqual([
      '4 NEGLIGIBLE CDL ITEMS',
    ]);
  });

  it('deletes an item', () => {
    const status = deleteAircraftStatusItem(aircraftStatusFromLogbook(LOGBOOK), 'R4');
    expect(status.cdlItems).toEqual([]);
    expect(status.melItems).toHaveLength(3);
  });
});
