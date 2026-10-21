// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  companyMessageMemoIndex,
  FwsCompanyMessageAural,
  isCompanyMessageAuralInhibited,
} from './FwsCompanyMessageAural';
import { FwcFlightPhase } from './FwsFlightPhases';

describe('A380 COMPANY MESSAGE voice', () => {
  it('is said once for each new unread company message', () => {
    const aural = new FwsCompanyMessageAural();
    const counts = [0, 1, 1, 2, 1, 0, 1];
    expect(counts.map((count) => aural.update(count, FwcFlightPhase.AtOrAbove1500FeetTo800Feet, 35_000, true))).toEqual(
      [false, true, false, true, false, false, true],
    );
  });

  it('not for the messages already there at the first update (systems host start)', () => {
    const aural = new FwsCompanyMessageAural();
    expect(aural.update(3, FwcFlightPhase.ElecPwr, 0, true)).toBe(false);
    expect(aural.update(4, FwcFlightPhase.ElecPwr, 0, true)).toBe(true);
  });

  it('a message received while the voice is inhibited is not said later', () => {
    const aural = new FwsCompanyMessageAural();
    aural.update(0, FwcFlightPhase.AtOrAbove1500FeetTo800Feet, 8_000, true);
    expect(aural.update(1, FwcFlightPhase.AtOrAbove1500FeetTo800Feet, 8_000, true)).toBe(false);
    expect(aural.update(1, FwcFlightPhase.AtOrAbove1500FeetTo800Feet, 12_000, true)).toBe(false);
  });
});

describe('COMPANY MESSAGE voice inhibition', () => {
  it('below 10 000 ft in flight phase 8', () => {
    expect(isCompanyMessageAuralInhibited(FwcFlightPhase.AtOrAbove1500FeetTo800Feet, 9_999)).toBe(true);
    expect(isCompanyMessageAuralInhibited(FwcFlightPhase.AtOrAbove1500FeetTo800Feet, 10_000)).toBe(false);
    expect(isCompanyMessageAuralInhibited(FwcFlightPhase.AtOrAbove1500FeetTo800Feet, null)).toBe(true);
  });

  it('in the flight phases of the COMPANY MSG memo inhibition (takeoff, landing)', () => {
    for (const phase of [3, 4, 5, 6, 7, 9, 10]) {
      expect(isCompanyMessageAuralInhibited(phase, 0)).toBe(true);
    }
    for (const phase of [1, 2, 11, 12]) {
      expect(isCompanyMessageAuralInhibited(phase, 0)).toBe(false);
    }
  });
});

describe('COMPANY MSG memo and voice through the SCIs', () => {
  it('no voice for a message received while the AOC alerts do not reach the FWS, nor once they do again', () => {
    const aural = new FwsCompanyMessageAural();
    const cruise = FwcFlightPhase.AtOrAbove1500FeetTo800Feet;
    aural.update(0, cruise, 35_000, true);
    expect(aural.update(1, cruise, 35_000, false)).toBe(false);
    expect(aural.update(1, cruise, 35_000, true)).toBe(false);
    expect(aural.update(2, cruise, 35_000, true)).toBe(true);
  });

  it('reads COMPANY MSG:PRNTR while a received message waits for its automatic printout', () => {
    expect(companyMessageMemoIndex(0)).toBe(0);
    expect(companyMessageMemoIndex(1)).toBe(1);
    expect(companyMessageMemoIndex(3)).toBe(1);
  });
});

describe('COMPANY MSG memo wiring', () => {
  const memos = readFileSync(resolve(__dirname, 'FwsMemos.ts'), 'utf-8');
  const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');

  it('shows COMPANY MSG:PRNTR from the waiting printouts', () => {
    expect(memos).toContain("codesToReturn: ['460000001', '460000002']");
    expect(memos).toContain('companyMessageMemoIndex(this.fws.compMesgWaitingPrintoutCount.get())');
    expect(core).toContain("'L:A32NX_COMPANY_MSG_PRNTR_COUNT'");
  });

  it('gates the memo and the voice on the SCI link', () => {
    expect(core).toContain('this.aocAlertsReachFws = !infoSys.nssDataToAvncsXfrFault && !infoSys.nssAvncsDataXfrFault');
    expect(core).toContain('this.compMesgCount.set(this.aocAlertsReachFws ? this.aocUnreadMessageCount : 0)');
  });
});
