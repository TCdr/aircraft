// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FmgcFlightPhase } from '@shared/flightphase';
import {
  destinationDataMessages,
  formatRnpValue,
  hasClockReachedTime,
  IRS_ONLY_NAVIGATION_DELAY_MS,
  IrsOnlyNavigationLogic,
  isIrsAirportPositionDisagree,
  isNavDatabaseCycleCurrent,
  isProcedureTurnExceedanceAhead,
  isTimeToExitHolding,
  MessageTextLatch,
  rnpMessage,
  utcCalendarDate,
} from './FmsMessageConditions';

describe('MessageTextLatch (send / recall of a type II message on its condition)', () => {
  it('sends once on the rising edge and recalls on the falling edge', () => {
    const latch = new MessageTextLatch();
    expect(latch.update(null)).toBe(null);
    expect(latch.update('TIME TO EXIT')).toEqual({ action: 'send', text: 'TIME TO EXIT' });
    expect(latch.update('TIME TO EXIT')).toBe(null);
    expect(latch.update(null)).toEqual({ action: 'recall', text: 'TIME TO EXIT' });
    expect(latch.update(null)).toBe(null);
  });

  it('recalls the old text first, then sends the new one, when the text changes', () => {
    const latch = new MessageTextLatch();
    latch.update('AREA RNP IS 1.00');
    expect(latch.update('AREA RNP IS 2.00')).toEqual({ action: 'recall', text: 'AREA RNP IS 1.00' });
    expect(latch.update('AREA RNP IS 2.00')).toEqual({ action: 'send', text: 'AREA RNP IS 2.00' });
  });
});

describe('AREA RNP IS / PROCEDURE (PROC) RNP IS', () => {
  it('has no message without a pilot RNP', () => {
    expect(rnpMessage(null, undefined, 2)).toBe(null);
    expect(rnpMessage(null, 0.3, 2)).toBe(null);
  });

  it('shows the area RNP when the pilot RNP is above the area default and the leg has no RNP', () => {
    expect(rnpMessage(3, undefined, 2)).toEqual({ kind: 'area', rnp: 2 });
    expect(rnpMessage(3, null, 2)).toEqual({ kind: 'area', rnp: 2 });
    expect(rnpMessage(2, undefined, 2)).toBe(null);
    expect(rnpMessage(1, undefined, 2)).toBe(null);
  });

  it('shows the procedure RNP when the pilot RNP is above the RNP of the active leg', () => {
    expect(rnpMessage(1, 0.3, 2)).toEqual({ kind: 'procedure', rnp: 0.3 });
    // the leg RNP takes precedence over the area default
    expect(rnpMessage(3, 0.3, 2)).toEqual({ kind: 'procedure', rnp: 0.3 });
    expect(rnpMessage(0.3, 0.3, 2)).toBe(null);
    expect(rnpMessage(0.1, 0.3, 2)).toBe(null);
  });

  it('formats the RNP with two decimals', () => {
    expect(formatRnpValue(2)).toBe('2.00');
    expect(formatRnpValue(0.3)).toBe('0.30');
    expect(formatRnpValue(10)).toBe('10.00');
  });
});

describe('CHECK DATA BASE CYCLE / CHECK DATABASE CYCLE', () => {
  const ident = { effectiveFrom: '2026-09-03', effectiveTo: '2026-10-01' };

  it('formats the UTC calendar date as the database ident does', () => {
    expect(utcCalendarDate(2026, 9, 3)).toBe('2026-09-03');
    expect(utcCalendarDate(2026, 10, 12)).toBe('2026-10-12');
  });

  it('is current within the effectivity, both ends included', () => {
    expect(isNavDatabaseCycleCurrent('2026-09-03', ident)).toBe(true);
    expect(isNavDatabaseCycleCurrent('2026-09-20', ident)).toBe(true);
    expect(isNavDatabaseCycleCurrent('2026-10-01', ident)).toBe(true);
  });

  it('is not current before or after the effectivity', () => {
    expect(isNavDatabaseCycleCurrent('2026-09-02', ident)).toBe(false);
    expect(isNavDatabaseCycleCurrent('2026-10-02', ident)).toBe(false);
    expect(isNavDatabaseCycleCurrent('2027-01-01', ident)).toBe(false);
  });

  it('raises nothing when the database effectivity is unknown', () => {
    expect(isNavDatabaseCycleCurrent('2026-10-12', null)).toBe(true);
    expect(isNavDatabaseCycleCurrent('2026-10-12', { effectiveFrom: '', effectiveTo: '' })).toBe(true);
  });
});

describe('CHECK IRS/AIRPORT POS / CHECK IRS / ARPT POSITION', () => {
  const airport = { lat: 48.0, long: 11.0 };
  // 1 minute of latitude is 1 NM
  const at = (nm: number) => ({ lat: 48.0 + nm / 60, long: 11.0 });

  it('disagrees when one IRS position is 5 NM or more from the airport', () => {
    expect(isIrsAirportPositionDisagree([at(1), at(5.01), at(1)], airport)).toBe(true);
    expect(isIrsAirportPositionDisagree([null, null, at(20)], airport)).toBe(true);
  });

  it('agrees when all IRS positions are within 5 NM', () => {
    expect(isIrsAirportPositionDisagree([at(0), at(2), at(4.9)], airport)).toBe(false);
  });

  it('raises nothing without an airport or without a valid IRS position', () => {
    expect(isIrsAirportPositionDisagree([at(20)], null)).toBe(false);
    expect(isIrsAirportPositionDisagree([null, null, null], airport)).toBe(false);
  });
});

describe('IRS ONLY NAVIGATION', () => {
  const minute = 60_000;

  it('shows after more than 10 min in IRS only navigation en route', () => {
    const logic = new IrsOnlyNavigationLogic();
    expect(IRS_ONLY_NAVIGATION_DELAY_MS).toBe(10 * minute);
    expect(logic.update(5 * minute, true, true, FmgcFlightPhase.Cruise)).toBe(false);
    expect(logic.update(5 * minute, true, true, FmgcFlightPhase.Cruise)).toBe(false);
    expect(logic.update(1000, true, true, FmgcFlightPhase.Cruise)).toBe(true);
  });

  it('shows at the start of the descent in IRS only navigation', () => {
    const logic = new IrsOnlyNavigationLogic();
    expect(logic.update(1000, true, true, FmgcFlightPhase.Cruise)).toBe(false);
    expect(logic.update(1000, true, true, FmgcFlightPhase.Descent)).toBe(true);
    expect(logic.update(1000, true, true, FmgcFlightPhase.Descent)).toBe(true);
  });

  it('does not show in a terminal area or approach, nor in the approach phase', () => {
    const logic = new IrsOnlyNavigationLogic();
    expect(logic.update(11 * minute, true, false, FmgcFlightPhase.Cruise)).toBe(false);
    expect(logic.update(1000, true, true, FmgcFlightPhase.Approach)).toBe(false);
  });

  it('does not show on the ground', () => {
    const logic = new IrsOnlyNavigationLogic();
    expect(logic.update(11 * minute, true, true, FmgcFlightPhase.Preflight)).toBe(false);
  });

  it('restarts the timer when the navigation leaves the IRS only mode', () => {
    const logic = new IrsOnlyNavigationLogic();
    logic.update(9 * minute, true, true, FmgcFlightPhase.Cruise);
    expect(logic.update(1000, false, true, FmgcFlightPhase.Cruise)).toBe(false);
    expect(logic.update(2 * minute, true, true, FmgcFlightPhase.Cruise)).toBe(false);
  });
});

describe('TIME TO EXIT', () => {
  it('shows in the holding when the extra fuel is zero or less', () => {
    expect(isTimeToExitHolding(true, 0)).toBe(true);
    expect(isTimeToExitHolding(true, -0.4)).toBe(true);
  });

  it('does not show with extra fuel, outside a holding, or without predictions', () => {
    expect(isTimeToExitHolding(true, 0.1)).toBe(false);
    expect(isTimeToExitHolding(false, -1)).toBe(false);
    expect(isTimeToExitHolding(true, null)).toBe(false);
  });
});

describe('T.O TIME REACHED', () => {
  it('is reached when the clock passes the ETT', () => {
    expect(hasClockReachedTime(36_000, 36_010, 36_005)).toBe(true);
    expect(hasClockReachedTime(36_000, 36_005, 36_005)).toBe(true);
  });

  it('is not reached before the ETT, nor when the ETT was already past at the first check', () => {
    expect(hasClockReachedTime(36_000, 36_004, 36_005)).toBe(false);
    expect(hasClockReachedTime(36_010, 36_020, 36_005)).toBe(false);
    expect(hasClockReachedTime(null, 36_020, 36_005)).toBe(false);
  });

  it('handles midnight', () => {
    // ETT 00:00:10, clock from 23:59:58 to 00:00:12
    expect(hasClockReachedTime(86_398, 12, 10)).toBe(true);
    // ETT 23:59:59
    expect(hasClockReachedTime(86_398, 2, 86_399)).toBe(true);
    // ETT 00:10:00 not yet reached at 00:00:02
    expect(hasClockReachedTime(86_398, 2, 600)).toBe(false);
  });
});

describe('EXPECT TURN AREA EXCEEDANCE', () => {
  it('is expected when the active or next leg is a procedure turn that exceeds its excursion distance', () => {
    expect(isProcedureTurnExceedanceAhead([{ turnAreaExceeded: true }, undefined])).toBe(true);
    expect(isProcedureTurnExceedanceAhead([{}, { turnAreaExceeded: true }])).toBe(true);
  });

  it('is not expected otherwise', () => {
    expect(isProcedureTurnExceedanceAhead([{ turnAreaExceeded: false }, {}])).toBe(false);
    expect(isProcedureTurnExceedanceAhead([undefined, null])).toBe(false);
  });
});

describe('ENTER DEST DATA / CHECK DEST DATA', () => {
  it('asks to enter the data when one is missing', () => {
    expect(destinationDataMessages(1013, null, 270, 10, true)).toEqual({ enterDestData: true, checkDestData: false });
    expect(destinationDataMessages(null, 15, 270, 10, true)).toEqual({ enterDestData: true, checkDestData: false });
    expect(destinationDataMessages(1013, 15, null, null, false)).toEqual({ enterDestData: true, checkDestData: false });
  });

  it('asks to check the data when the wind was received by uplink', () => {
    expect(destinationDataMessages(1013, 15, 270, 10, false)).toEqual({ enterDestData: false, checkDestData: true });
  });

  it('raises nothing when the flight crew entered everything', () => {
    expect(destinationDataMessages(1013, 15, 270, 10, true)).toEqual({ enterDestData: false, checkDestData: false });
  });
});
