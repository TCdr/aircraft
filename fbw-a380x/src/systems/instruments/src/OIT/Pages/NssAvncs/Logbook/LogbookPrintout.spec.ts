// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import { createTechLogbook } from '../../../System/TechLogbook';
import { TechLogbookStore } from '../../../System/TechLogbookStore';
import { LOGBOOK_URI, logbookPrintout } from './LogbookFlows';

/** The parts of the logbook a printout reads */
const store = {
  state: Subject.create(createTechLogbook()),
  shownFlightIndex: Subject.create<number | null>(null),
  registration: () => 'F-GGEA',
  avionicsInfo: () => ({ flightNumber: 'AIB003', from: 'LFBO', to: 'LFPG', now: Date.UTC(2009, 1, 18, 20, 22) }),
  blockData: () => ({
    outTime: null,
    offTime: null,
    onTime: null,
    inTime: null,
    outFob: null,
    inFob: null,
    flightTime: null,
  }),
} as unknown as TechLogbookStore;

describe('logbook printouts', () => {
  it('prints each page under its own title, not as an AOC message', () => {
    expect(logbookPrintout(store, LOGBOOK_URI.status)?.title).toBe('LOGBOOK STATUS');
    expect(logbookPrintout(store, LOGBOOK_URI.application)?.title).toBe('LOGBOOK STATUS');
    expect(logbookPrintout(store, LOGBOOK_URI.acceptanceReport)?.title).toBe('ACCEPTANCE REPORT');
    expect(logbookPrintout(store, LOGBOOK_URI.flightData)?.title).toBe('FLIGHT DATA');
  });

  it('prints the text of the page', () => {
    expect(logbookPrintout(store, LOGBOOK_URI.status)?.text).toContain('ACFT REGISTRATION : F-GGEA');
  });

  it('prints nothing for a page without a printout', () => {
    expect(logbookPrintout(store, LOGBOOK_URI.history)).toBeNull();
  });
});
