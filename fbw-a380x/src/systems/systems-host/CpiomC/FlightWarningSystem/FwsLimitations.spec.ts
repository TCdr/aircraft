// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { describe, expect, it } from 'vitest';
import type { FwsCore } from './FwsCore';
import { FwsLimitations, FwsLimitationsPhases, withoutAllPhasesDuplicates } from './FwsLimitations';

/** An FwsCore stand-in: every signal FwsLimitations reads is a Subject at false */
function fakeFws(): FwsCore {
  const subjects = new Map<string | symbol, Subject<boolean>>();
  return new Proxy(
    {},
    {
      get: (_target, name) => {
        if (!subjects.has(name)) {
          subjects.set(name, Subject.create(false));
        }
        return subjects.get(name);
      },
    },
  ) as unknown as FwsCore;
}

describe('FwsLimitations', () => {
  /*
   * A380 FCOM PRO-ABN-ECAM-10-27-10 F/CTL DIRECT LAW (a380_fcom.txt l.144962-144972, PDF page 5025): LIMITATIONS ON ECAM
   * and ON PFD, APPR & LDG: MAX SPEED : 310/.86, MANEUVER WITH CARE.
   */
  it.each([
    ['240400002', 'MAX SPEED: 310/.86'],
    ['240400004', 'MANEUVER WITH CARE'],
  ])('F/CTL DIRECT LAW %s %s is an APPR & LDG limitation, also on the PFD', (key) => {
    const item = new FwsLimitations(fakeFws()).limitations[key];
    expect(item.phase).toBe(FwsLimitationsPhases.ApprLdg);
    expect(item.pfd).toBe(true);
  });

  it('the APPR & LDG column drops a limitation the ALL PHASES column already shows', () => {
    // F/CTL DIRECT LAW (APPR & LDG) with NAV ALL AIR DATA DISAGREE (ALL PHASES, a380_fcom.txt l.164233-164235)
    expect(withoutAllPhasesDuplicates(['240400002', '240400004', '800400003'], ['240400002'])).toEqual([
      '240400004',
      '800400003',
    ]);
  });
});
