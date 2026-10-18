// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { isPageFunctionAvailable } from '../../../OitPageFunctions';
import { LOGBOOK_URI, allRowsTicked, logbookPageFunctions } from './LogbookFlows';

describe('logbook functions of the NSS AVNCS menu bar', () => {
  it('has PRINT on the STATUS page, the acceptance report and the PRE/POST-FLIGHT panels only', () => {
    for (const uri of [
      LOGBOOK_URI.application,
      LOGBOOK_URI.status,
      LOGBOOK_URI.acceptanceReport,
      LOGBOOK_URI.flightData,
    ]) {
      expect(
        isPageFunctionAvailable(
          logbookPageFunctions(uri, () => {}),
          'print',
        ),
      ).toBe(true);
    }
    for (const uri of [LOGBOOK_URI.entry, LOGBOOK_URI.history, LOGBOOK_URI.openItems]) {
      expect(
        isPageFunctionAvailable(
          logbookPageFunctions(uri, () => {}),
          'print',
        ),
      ).toBe(false);
    }
  });

  it('prints the page shown through the registered PRINT', () => {
    const print = vi.fn();
    logbookPageFunctions(LOGBOOK_URI.status, print).print?.run();
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('has no UPDATE of its own: the menu bar reloads the page', () => {
    expect(logbookPageFunctions(LOGBOOK_URI.status, () => {}).update).toBeUndefined();
  });
});

describe('tick-all box of the OPEN ITEMS table', () => {
  it('shows ticked only when every row is ticked', () => {
    expect(allRowsTicked([{ ticked: true }, { ticked: true }])).toBe(true);
    expect(allRowsTicked([{ ticked: true }, { ticked: false }])).toBe(false);
    expect(allRowsTicked([{ ticked: true }, {}])).toBe(false);
  });

  it('shows unticked on an empty table', () => {
    expect(allRowsTicked([])).toBe(false);
  });
});
