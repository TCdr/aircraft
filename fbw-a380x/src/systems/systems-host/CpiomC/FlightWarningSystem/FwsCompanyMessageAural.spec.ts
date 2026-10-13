// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FwsCompanyMessageAural, isCompanyMessageAuralInhibited } from './FwsCompanyMessageAural';
import { FwcFlightPhase } from './FwsFlightPhases';

describe('A380 COMPANY MESSAGE voice (a380_fcom.txt l.73651-73652, 108111-108120)', () => {
  it('is said once for each new unread company message', () => {
    const aural = new FwsCompanyMessageAural();
    const counts = [0, 1, 1, 2, 1, 0, 1];
    expect(counts.map((count) => aural.update(count, FwcFlightPhase.AtOrAbove1500FeetTo800Feet, 35_000))).toEqual([
      false,
      true,
      false,
      true,
      false,
      false,
      true,
    ]);
  });

  it('not for the messages already there at the first update (systems host start)', () => {
    const aural = new FwsCompanyMessageAural();
    expect(aural.update(3, FwcFlightPhase.ElecPwr, 0)).toBe(false);
    expect(aural.update(4, FwcFlightPhase.ElecPwr, 0)).toBe(true);
  });

  it('a message received while the voice is inhibited is not said later', () => {
    const aural = new FwsCompanyMessageAural();
    aural.update(0, FwcFlightPhase.AtOrAbove1500FeetTo800Feet, 8_000);
    expect(aural.update(1, FwcFlightPhase.AtOrAbove1500FeetTo800Feet, 8_000)).toBe(false);
    expect(aural.update(1, FwcFlightPhase.AtOrAbove1500FeetTo800Feet, 12_000)).toBe(false);
  });
});

describe('COMPANY MESSAGE voice inhibition', () => {
  it('below 10 000 ft in flight phase 8 (l.108111-108116)', () => {
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
