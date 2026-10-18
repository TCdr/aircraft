// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  GROUND_RECTIFICATION_ACTION,
  LOGBOOK_PAST_FLIGHTS_KEPT,
  LogbookAvionicsInfo,
  LogbookBlockData,
  TechLogbookState,
  acceptanceProblems,
  acceptanceReport,
  acceptanceReportPrintText,
  appearedEcamAlerts,
  canCloseFlight,
  canEditFlightInfo,
  changeAdditionalInfo,
  changeTemporaryComment,
  closeFlight,
  closureFindings,
  completeAcceptance,
  completeGroundUpdate,
  completeSending,
  createTechLogbook,
  deferralExpiryText,
  deferralMaintAction,
  deferredItems,
  deleteTemporaryItem,
  ecamAlertAta,
  ecamAlertTitle,
  effectivePostFlight,
  enterFlightInfo,
  enterPostFlight,
  enterPreFlight,
  flightDataPrintText,
  flightInfo,
  formatLogbookDate,
  formatLogbookDateTime,
  formatLogbookMinutes,
  giveBackToGround,
  itemCounts,
  itemsIn,
  makeReportRef,
  markListViewed,
  missingPreFlight,
  parseLogbookDate,
  parseLogbookMinutes,
  parseTechLogbook,
  recordDefect,
  signAcceptance,
  startSending,
  statusPrintText,
  storeTemporaryInOpen,
  unrecordedEcamAlerts,
  validateCabinItem,
} from './TechLogbook';

const T0 = Date.UTC(2009, 1, 18, 20, 22, 25);
const REG = 'F-GGEA';

const AVIONICS: LogbookAvionicsInfo = { flightNumber: 'AIB003', from: 'LFBO', to: 'LFPG', now: T0 };

const NO_BLOCK: LogbookBlockData = {
  outTime: null,
  offTime: null,
  onTime: null,
  inTime: null,
  outFob: null,
  inFob: null,
  flightTime: null,
};

const FLOWN: LogbookBlockData = {
  outTime: Date.UTC(2009, 1, 18, 15, 30),
  offTime: Date.UTC(2009, 1, 18, 15, 40),
  onTime: Date.UTC(2009, 1, 18, 17, 30),
  inTime: Date.UTC(2009, 1, 18, 17, 38),
  outFob: 80_000,
  inFob: 60_000,
  flightTime: 110 * 60_000,
};

/**
 * A logbook taken on board with a fresh maintenance release
 * @returns the logbook
 */
function onBoard(): TechLogbookState {
  return completeGroundUpdate(createTechLogbook(), T0 - 3_600_000, REG);
}

/**
 * The mandatory PRE-FLIGHT parameters entered
 * @param state the logbook
 * @returns the logbook
 */
function withPreFlight(state: TechLogbookState): TechLogbookState {
  return enterPreFlight(state, { totalUplift: 12_000, noDeIcing: true });
}

/**
 * An accepted aircraft
 * @param state the logbook before the acceptance
 * @returns the logbook
 */
function accepted(state: TechLogbookState = withPreFlight(onBoard())): TechLogbookState {
  return completeAcceptance(signAcceptance(state, AVIONICS), true, T0);
}

describe('technical logbook formats', () => {
  it('writes the dates and times as the logbook pages', () => {
    expect(formatLogbookDate(Date.UTC(2009, 1, 19))).toBe('19-FEB-09');
    expect(formatLogbookDateTime(Date.UTC(2009, 1, 18, 18, 4))).toBe('18-FEB-09 18:04');
    expect(formatLogbookDate(null)).toBe('---');
    expect(formatLogbookMinutes(15 * 60 + 10)).toBe('15:10');
    expect(formatLogbookMinutes(null)).toBe('-----');
  });

  it('reads HH:MM entries with or without the colon and refuses impossible times', () => {
    expect(parseLogbookMinutes('1540', 23)).toBe(15 * 60 + 40);
    expect(parseLogbookMinutes('15:40', 23)).toBe(15 * 60 + 40);
    expect(parseLogbookMinutes('', 23)).toBeNull();
    expect(parseLogbookMinutes('2460', 23)).toBeUndefined();
    expect(parseLogbookMinutes('1275', 23)).toBeUndefined();
    expect(parseLogbookMinutes('1234:00', 99_999)).toBe(1234 * 60);
  });

  it('reads the date of flight as DDMMYY or DD-MMM-YY', () => {
    expect(parseLogbookDate('190209')).toBe(Date.UTC(2009, 1, 19));
    expect(parseLogbookDate('19-FEB-09')).toBe(Date.UTC(2009, 1, 19));
    expect(parseLogbookDate('310209')).toBeUndefined();
    expect(parseLogbookDate('')).toBeNull();
  });

  it('makes the REF REPORT from the registration and the time, unique per item', () => {
    expect(makeReportRef(REG, T0, [])).toBe('FGGEA090218202225L');
    expect(makeReportRef(REG, T0, ['FGGEA090218202225L'])).toBe('FGGEA090218202226L');
  });
});

describe('technical logbook control and recording', () => {
  it('starts on ground without a maintenance release, and the first UPDATE takes it on board with one', () => {
    const fresh = createTechLogbook();
    expect(fresh.control).toBe('on-ground');
    expect(fresh.release).toBeNull();

    const updated = completeGroundUpdate(fresh, T0, REG);
    expect(updated.control).toBe('on-board');
    expect(updated.lastSync).toBe(T0);
    expect(updated.release?.date).toBe(T0);
  });

  it('records nothing while the ground has the control', () => {
    const state = giveBackToGround(onBoard(), T0);
    expect(recordDefect(state, { title: 'X', ata: '', pilotComment: '' }, 'open', T0, REG)).toBe(state);
    expect(enterPreFlight(state, { totalUplift: 5 })).toBe(state);
  });

  it('stores a defect in the open or temporary items with its reference and flight', () => {
    let state = recordDefect(
      onBoard(),
      { title: ' DOME LIGHT INOPERATIVE ', ata: '33-12-00', pilotComment: 'NONE' },
      'open',
      T0,
      REG,
    );
    state = recordDefect(state, { title: 'CKPT SEAT', ata: '25-11-00', pilotComment: '' }, 'temporary', T0, REG);

    const [open] = itemsIn(state, 'open');
    expect(open.title).toBe('DOME LIGHT INOPERATIVE');
    expect(open.ref).toBe('FGGEA090218202225L');
    expect(open.flightIndex).toBe(1);
    expect(open.sendStatus).toBe('not-sent');
    expect(itemsIn(state, 'temporary')[0].ref).toBe('FGGEA090218202226L');
    expect(itemCounts(state)).toEqual({ open: 1, deferred: 0, temporary: 1, cabinOpen: 0 });
  });

  it('only changes ADDITIONAL INFO of an open item and PILOT COMMENT of a temporary item', () => {
    let state = recordDefect(onBoard(), { title: 'A', ata: '', pilotComment: 'P' }, 'open', T0, REG);
    state = recordDefect(state, { title: 'B', ata: '', pilotComment: 'Q' }, 'temporary', T0 + 1000, REG);
    const openRef = itemsIn(state, 'open')[0].ref;
    const tempRef = itemsIn(state, 'temporary')[0].ref;

    expect(changeTemporaryComment(state, openRef, 'NEW')).toBe(state);
    expect(changeAdditionalInfo(state, tempRef, 'NEW')).toBe(state);

    state = changeAdditionalInfo(state, openRef, 'LOGBOOK ENTRY INACCURATE');
    state = changeTemporaryComment(state, tempRef, 'UPDATED');
    expect(itemsIn(state, 'open')[0].additionalInfo).toBe('LOGBOOK ENTRY INACCURATE');
    expect(itemsIn(state, 'temporary')[0].pilotComment).toBe('UPDATED');
  });

  it('deletes a temporary item, or stores it in the open items, but never deletes an open item', () => {
    let state = recordDefect(onBoard(), { title: 'A', ata: '', pilotComment: '' }, 'open', T0, REG);
    state = recordDefect(state, { title: 'B', ata: '', pilotComment: '' }, 'temporary', T0 + 1000, REG);
    state = recordDefect(state, { title: 'C', ata: '', pilotComment: '' }, 'temporary', T0 + 2000, REG);
    const [c, b] = itemsIn(state, 'temporary');

    expect(deleteTemporaryItem(state, itemsIn(state, 'open')[0].ref).items).toHaveLength(3);
    state = deleteTemporaryItem(state, c.ref);
    state = storeTemporaryInOpen(state, b.ref, 'SEEN ON WALKAROUND');
    expect(itemsIn(state, 'temporary')).toHaveLength(0);
    expect(itemsIn(state, 'open').map((i) => i.title)).toEqual(['B', 'A']);
    expect(itemsIn(state, 'open')[0].pilotComment).toBe('SEEN ON WALKAROUND');
  });

  it('validates a cabin defect into the open items or keeps it in the cabin open items', () => {
    const base = onBoard();
    const cabinItem = {
      ...itemsIn(
        recordDefect(base, { title: 'BAR, MBA, SEAT BELT, INOPERATIVE', ata: '', pilotComment: '' }, 'open', T0, REG),
        'open',
      )[0],
      state: 'cabin-submitted' as const,
    };
    const state: TechLogbookState = { ...base, items: [cabinItem] };

    expect(itemsIn(validateCabinItem(state, cabinItem.ref, 'open', 'OK'), 'open')).toHaveLength(1);
    expect(itemCounts(validateCabinItem(state, cabinItem.ref, 'cabin-open', '')).cabinOpen).toBe(1);
  });

  it('sends the ticked open items, SENT with the ground acknowledgement, NOT SENT without', () => {
    let state = recordDefect(onBoard(), { title: 'A', ata: '', pilotComment: '' }, 'open', T0, REG);
    state = recordDefect(state, { title: 'B', ata: '', pilotComment: '' }, 'open', T0 + 1000, REG);
    const [b, a] = itemsIn(state, 'open');

    const sending = startSending(state, [a.ref, b.ref]);
    expect(sending.sent).toEqual([a.ref, b.ref]);
    expect(itemsIn(sending.state, 'open').every((i) => i.sendStatus === 'sending')).toBe(true);

    const acknowledged = completeSending(sending.state, [a.ref], true);
    const lost = completeSending(acknowledged, [b.ref], false);
    expect(itemsIn(lost, 'open').map((i) => i.sendStatus)).toEqual(['not-sent', 'sent']);
    expect(startSending(lost, [a.ref]).sent).toEqual([]);
  });
});

describe('technical logbook flight information', () => {
  it('shows the FMS values in magenta until the crew enters a value (cyan)', () => {
    const state = enterFlightInfo(onBoard(), 'to', 'EGLL');
    const info = flightInfo(state.flight, AVIONICS);
    expect(info.flightNumber).toEqual({ value: 'AIB003', byCrew: false });
    expect(info.to).toEqual({ value: 'EGLL', byCrew: true });
    expect(info.date).toBe(T0);
  });

  it('only lets TO change after the acceptance', () => {
    const state = accepted();
    expect(canEditFlightInfo(state, 'flightNumber')).toBe(false);
    expect(canEditFlightInfo(state, 'to')).toBe(true);
    expect(enterFlightInfo(state, 'from', 'LFML')).toBe(state);
    expect(flightInfo(enterFlightInfo(state, 'to', 'LFLL').flight, AVIONICS).to.value).toBe('LFLL');
  });

  it('keeps the signed values when the FMS changes after the acceptance', () => {
    const state = accepted();
    const info = flightInfo(state.flight, { ...AVIONICS, flightNumber: 'XYZ999', now: T0 + 86_400_000 });
    expect(info.flightNumber.value).toBe('AIB003');
    expect(info.date).toBe(T0);
  });

  it('needs the uplift and an icing statement before the acceptance', () => {
    expect(missingPreFlight(onBoard().flight.preFlight)).toEqual(['TOTAL UPLIFT', 'ICING']);
    expect(missingPreFlight({ ...onBoard().flight.preFlight, totalUplift: 0, deIcingStart: 600 })).toEqual([]);
  });
});

describe('aircraft acceptance', () => {
  it('lists what PIC ACCEPT checks', () => {
    let state = giveBackToGround(createTechLogbook(), T0);
    state = recordDefect(
      completeGroundUpdate(state, T0, REG),
      { title: 'A', ata: '', pilotComment: '' },
      'open',
      T0,
      REG,
    );
    expect(acceptanceProblems(giveBackToGround(state, T0), { ...AVIONICS, to: null })).toEqual([
      'logbook-on-ground',
      'open-items-not-viewed',
      'flight-info-missing',
      'preflight-data-missing',
    ]);
    expect(acceptanceProblems(createTechLogbook(), AVIONICS)).toContain('no-valid-release');

    const ready = withPreFlight(markListViewed(state, 'open'));
    expect(acceptanceProblems(ready, AVIONICS)).toEqual([]);
  });

  it('does not ask to view an empty list', () => {
    expect(acceptanceProblems(withPreFlight(onBoard()), AVIONICS)).toEqual([]);
  });

  it('accepts the aircraft after the signature and the synchronisation, with or without the acknowledgement', () => {
    const signed = signAcceptance(withPreFlight(onBoard()), AVIONICS);
    expect(signed.flight.acceptance).toBe('syncing');
    expect(signAcceptance(onBoard(), AVIONICS).flight.acceptance).toBe('not-accepted');

    const ack = completeAcceptance(signed, true, T0 + 5000);
    expect(ack.flight).toMatchObject({ acceptance: 'accepted', acceptanceAcknowledged: true });
    expect(ack.lastSync).toBe(T0 + 5000);
    expect(completeAcceptance(signed, false, T0 + 5000).flight).toMatchObject({
      acceptance: 'accepted',
      acceptanceAcknowledged: false,
    });
  });

  it('builds the acceptance report with the deferred and open items', () => {
    const base = recordDefect(
      onBoard(),
      { title: 'ENG 2 REVERSER FAULT', ata: '78-30-00', pilotComment: '' },
      'open',
      T0,
      REG,
    );
    const deferred = {
      ...itemsIn(base, 'open')[0],
      ref: 'FGGEA090218173550L',
      title: 'F/CTL PRIM 1 FAULT',
      ata: '27-93-00',
      state: 'deferred' as const,
      deferral: {
        category: 'MEL' as const,
        classification: 'MEL(o)(m)',
        reference: '27-93-01',
        expiryDate: Date.UTC(2009, 1, 28),
        rectificationInterval: 'C',
        severity: 'MEDIUM',
      },
    };
    const state: TechLogbookState = { ...base, items: [...base.items, deferred] };

    const report = acceptanceReport(state, AVIONICS, REG);
    expect(report).toMatchObject({
      flightNumber: 'AIB003',
      tail: 'FGGEA',
      from: 'LFBO',
      to: 'LFPG',
      utc: '20:22',
      releaseValid: true,
    });
    expect(report.items.map((i) => i.title)).toEqual(['F/CTL PRIM 1 FAULT', 'ENG 2 REVERSER FAULT']);
    expect(report.items[0]).toMatchObject({ reference: '27-93-01', deferredLimit: '28-FEB-09', severity: 'MEDIUM' });
    expect(acceptanceReportPrintText(report)).toContain('CERTIFICATE OF RELEASE TO SERVICE : VALID');
  });

  it('sorts the deferred items by expiry, items without expiry last', () => {
    const base = onBoard();
    const item = (ref: string, expiryDate: number | null) => ({
      ...itemsIn(recordDefect(base, { title: ref, ata: '', pilotComment: '' }, 'open', T0, REG), 'open')[0],
      ref,
      state: 'deferred' as const,
      deferral: {
        category: 'MEL' as const,
        classification: 'MEL',
        reference: '',
        expiryDate,
        rectificationInterval: '',
        severity: '',
      },
    });
    const state: TechLogbookState = {
      ...base,
      items: [item('NONE', null), item('LATE', T0 + 2), item('SOON', T0 + 1)],
    };
    expect(deferredItems(state, 'MEL').map((i) => i.ref)).toEqual(['SOON', 'LATE', 'NONE']);
    expect(deferredItems(state, 'CDL')).toEqual([]);
    expect(deferredItems(state, 'MEL').map(deferralExpiryText)).toEqual(['18-FEB-09', '18-FEB-09', '']);
  });
});

describe('ECAM alerts of the flight', () => {
  it('lists every new appearance of an alert', () => {
    expect(appearedEcamAlerts(['1'], ['1', '2'])).toEqual(['2']);
    expect(appearedEcamAlerts(['1', '2'], ['2'])).toEqual([]);
    expect(appearedEcamAlerts(['2'], ['1', '2'])).toEqual(['1']);
  });

  it('cleans the EWD title and takes the ATA chapter from the alert id', () => {
    expect(ecamAlertTitle('\x1b<4m\x1b4mELEC\x1bm AC BUS 1 FAULT')).toBe('ELEC AC BUS 1 FAULT');
    expect(ecamAlertTitle("\x1b<4m\x1b4mELEC\x1bm \x1b'mAC BUS 1+2 & DC BUS 1 FAULT\x1bm")).toBe(
      'ELEC AC BUS 1+2 & DC BUS 1 FAULT',
    );
    expect(ecamAlertAta('240800002')).toBe('24-00-00');
    expect(ecamAlertAta('X')).toBe('');
  });

  it('finds the alerts no item of this flight records, each alert once', () => {
    const occurrences = [
      { id: '2', title: 'B', time: T0 + 2 },
      { id: '1', title: 'A', time: T0 + 1 },
      { id: '2', title: 'B', time: T0 },
    ];
    const state = recordDefect(
      onBoard(),
      { title: 'A', ata: '', pilotComment: '', ecamAlertId: '1' },
      'temporary',
      T0,
      REG,
    );
    expect(unrecordedEcamAlerts(state, occurrences).map((o) => o.id)).toEqual(['2']);
  });
});

describe('flight closure', () => {
  it('takes the POST-FLIGHT times from the flight log and B/F from the previous flight', () => {
    const state = accepted();
    const post = effectivePostFlight(state, state.flight, FLOWN);
    expect(post.flightTime).toEqual({ value: 110, byCrew: false });
    expect(post.takeOff.value).toBe(15 * 60 + 40);
    expect(post.landing.value).toBe(17 * 60 + 30);
    expect(post.totalTimeBroughtForward.value).toBeNull();
    expect(post.totalTime).toBeNull();

    const entered = enterPostFlight(state, { totalTimeBroughtForward: 15 * 60 + 10 });
    const closed = closeFlight(entered, AVIONICS, FLOWN);
    const next = effectivePostFlight(closed, closed.flight, NO_BLOCK);
    expect(next.totalTimeBroughtForward).toEqual({ value: 17 * 60, byCrew: false });
  });

  it('reports cabin entries, unrecorded alerts, temporary items and missing parameters', () => {
    let state = recordDefect(accepted(), { title: 'T', ata: '', pilotComment: '' }, 'temporary', T0, REG);
    const findings = closureFindings(state, [{ id: '9', title: 'X', time: T0 }], NO_BLOCK);
    expect(findings.unrecordedEcamAlerts.map((o) => o.id)).toEqual(['9']);
    expect(findings.temporaryItems).toHaveLength(1);
    expect(findings.missingPostFlight).toEqual(['FLIGHT TIME', 'LANDING', 'TAKE OFF']);

    const cabin = { ...state.items[0], ref: 'CABIN', state: 'cabin-submitted' as const };
    state = { ...state, items: [...state.items, cabin] };
    expect(closureFindings(state, [], FLOWN).cabinItemsToValidate).toHaveLength(1);
    expect(canCloseFlight(state)).toBe(false);
  });

  it('closes only an accepted flight, deletes the temporary items and opens the next flight', () => {
    expect(canCloseFlight(withPreFlight(onBoard()))).toBe(false);

    let state = recordDefect(accepted(), { title: 'T', ata: '', pilotComment: '' }, 'temporary', T0, REG);
    state = recordDefect(state, { title: 'O', ata: '', pilotComment: '' }, 'open', T0 + 1000, REG);
    const closed = closeFlight(state, { ...AVIONICS, now: T0 + 7_200_000 }, FLOWN);

    expect(closed.flight.index).toBe(2);
    expect(closed.flight.acceptance).toBe('not-accepted');
    expect(itemsIn(closed, 'temporary')).toHaveLength(0);
    expect(itemsIn(closed, 'open')).toHaveLength(1);
    expect(closed.pastFlights[0]).toMatchObject({ index: 1, closedAt: T0 + 7_200_000, blockData: FLOWN });
    expect(closed.pastFlights[0].postFlight.flightTime).toBe(110);
    expect(flightInfo(closed.pastFlights[0], { ...AVIONICS, flightNumber: 'NEXT' }).flightNumber.value).toBe('AIB003');
  });

  it('keeps a bounded number of past flights', () => {
    let state = onBoard();
    for (let i = 0; i < LOGBOOK_PAST_FLIGHTS_KEPT + 2; i++) {
      state = closeFlight(accepted(withPreFlight(state)), AVIONICS, FLOWN);
    }
    expect(state.pastFlights).toHaveLength(LOGBOOK_PAST_FLIGHTS_KEPT);
    expect(state.pastFlights[0].index).toBe(LOGBOOK_PAST_FLIGHTS_KEPT + 2);
  });

  it('has the ground maintenance close the open items of the closed flights at the next UPDATE', () => {
    let state = recordDefect(accepted(), { title: 'O', ata: '', pilotComment: '' }, 'open', T0, REG);
    state = closeFlight(state, AVIONICS, FLOWN);
    state = recordDefect(state, { title: 'NEW', ata: '', pilotComment: '' }, 'open', T0 + 1000, REG);
    state = giveBackToGround(state, T0 + 2000);

    const updated = completeGroundUpdate(state, T0 + 3000, REG);
    const [closedItem] = itemsIn(updated, 'closed');
    expect(closedItem).toMatchObject({
      title: 'O',
      closeDate: T0 + 3000,
      lastMaintAction: GROUND_RECTIFICATION_ACTION,
    });
    expect(itemsIn(updated, 'open').map((i) => i.title)).toEqual(['NEW']);
    expect(updated.release?.closedItemRefs).toEqual([closedItem.ref]);
    expect(updated.control).toBe('on-board');
  });

  it('has the ground maintenance defer the deferrable items: closed in the HISTORY, listed in DEFERRED ITEMS', () => {
    let state = recordDefect(accepted(), { title: 'FUEL PUMP', ata: '28-21-00', pilotComment: 'P' }, 'open', T0, REG);
    state = recordDefect(state, { title: 'DISCHARGER', ata: '23-61-00', pilotComment: '' }, 'open', T0, REG);
    state = recordDefect(state, { title: 'WINDOW', ata: '56-10-00', pilotComment: '' }, 'open', T0, REG);
    state = recordDefect(state, { title: 'SIDESTICK', ata: '27-92-00', pilotComment: '' }, 'open', T0, REG);
    state = giveBackToGround(closeFlight(state, AVIONICS, FLOWN), T0 + 2000);
    const now = Date.UTC(2009, 1, 19, 6, 0);

    const updated = completeGroundUpdate(state, now, REG);

    expect(itemsIn(updated, 'open')).toEqual([]);
    const history = itemsIn(updated, 'closed');
    expect(history.map((i) => [i.title, i.lastMaintAction])).toEqual(
      expect.arrayContaining([
        ['FUEL PUMP', 'DEFERRED IAW MEL 28-21-01'],
        ['DISCHARGER', 'DEFERRED IAW CDL 23-61-01'],
        ['WINDOW', 'DEFERRED BY MAINTENANCE'],
        ['SIDESTICK', GROUND_RECTIFICATION_ACTION],
      ]),
    );
    expect(updated.release?.closedItemRefs).toHaveLength(4);

    const [mel] = deferredItems(updated, 'MEL');
    expect(mel).toMatchObject({
      title: 'FUEL PUMP',
      ata: '28-21-00',
      pilotComment: 'P',
      openDate: now,
      closeDate: null,
      lastMaintAction: 'DEFERRED IAW MEL 28-21-01',
      deferral: { category: 'MEL', classification: 'MEL(o)(m)', reference: '28-21-01', rectificationInterval: 'C' },
    });
    // Interval C: ten days after the day of the deferral
    expect(deferralExpiryText(mel)).toBe('01-MAR-09');
    expect(history.map((i) => i.ref)).not.toContain(mel.ref);
    expect(deferredItems(updated, 'CDL').map((i) => [i.title, deferralExpiryText(i)])).toEqual([['DISCHARGER', '']]);
    expect(deferredItems(updated, 'OTHER').map((i) => i.title)).toEqual(['WINDOW']);
  });

  it('has the ground maintenance rectify a deferred item once it has expired', () => {
    let state = recordDefect(accepted(), { title: 'FUEL PUMP', ata: '28-21-00', pilotComment: '' }, 'open', T0, REG);
    state = completeGroundUpdate(giveBackToGround(closeFlight(state, AVIONICS, FLOWN), T0), T0, REG);
    const [mel] = deferredItems(state, 'MEL');
    const expiry = mel.deferral?.expiryDate ?? 0;

    const before = completeGroundUpdate(giveBackToGround(state, expiry), expiry, REG);
    expect(deferredItems(before, 'MEL')).toHaveLength(1);

    const after = completeGroundUpdate(giveBackToGround(state, expiry + 1000), expiry + 1000, REG);
    expect(deferredItems(after, 'MEL')).toEqual([]);
    expect(itemsIn(after, 'closed').find((i) => i.ref === mel.ref)).toMatchObject({
      closeDate: expiry + 1000,
      lastMaintAction: GROUND_RECTIFICATION_ACTION,
    });
    expect(after.release?.closedItemRefs).toEqual([mel.ref]);
  });

  it('writes what maintenance did when it deferred an item', () => {
    expect(deferralMaintAction({ category: 'MEL', reference: '28-21-01' })).toBe('DEFERRED IAW MEL 28-21-01');
    expect(deferralMaintAction({ category: 'OTHER', reference: '' })).toBe('DEFERRED BY MAINTENANCE');
  });
});

describe('technical logbook storage and printouts', () => {
  it('reads back a stored logbook and refuses anything else', () => {
    const state = accepted();
    expect(parseTechLogbook(JSON.stringify(state))).toEqual(state);
    expect(parseTechLogbook('')).toBeNull();
    expect(parseTechLogbook('{"version":2}')).toBeNull();
    expect(parseTechLogbook('not json')).toBeNull();
  });

  it('prints the STATUS page and the flight data', () => {
    const state = recordDefect(
      accepted(),
      { title: 'DOME LIGHT INOPERATIVE', ata: '', pilotComment: '' },
      'open',
      T0,
      REG,
    );
    const status = statusPrintText(state, AVIONICS, REG);
    expect(status).toContain('ACFT REGISTRATION : F-GGEA');
    expect(status).toContain('OPEN ITEMS : 1');
    expect(status).toContain('18-FEB-09 DOME LIGHT INOPERATIVE');
    expect(status).toContain('AIRCRAFT ACCEPTED');

    const data = flightDataPrintText(
      state.flight,
      flightInfo(state.flight, AVIONICS),
      effectivePostFlight(state, state.flight, FLOWN),
    );
    expect(data).toContain('ICING : NIL (NO DE-ICING)');
    expect(data).toContain('TAKE OFF : 15:40 Z   LANDING : 17:30 Z');
  });
});
