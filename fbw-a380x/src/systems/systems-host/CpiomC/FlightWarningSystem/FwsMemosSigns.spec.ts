// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Subject } from '@microsoft/msfs-sdk';
import { describe, expect, it } from 'vitest';
import type { FwsCore } from './FwsCore';
import { FwsMemos } from './FwsMemos';

type SignsFws = FwsCore & { seatBeltsSwitchOn: Subject<boolean>; noSmokingSwitchOn: Subject<boolean> };

/** An FwsCore stand-in: every signal FwsMemos reads is a Subject (false, or 0 for the counters) */
function fakeFws(): SignsFws {
  const subjects = new Map<string | symbol, Subject<any>>();
  return new Proxy(
    {},
    {
      get: (_target, name) => {
        if (!subjects.has(name)) {
          subjects.set(name, Subject.create<any>(typeof name === 'string' && /Count$/.test(name) ? 0 : false));
        }
        return subjects.get(name);
      },
    },
  ) as unknown as SignsFws;
}

/** The right-column memos FwsCore shows: active, not inhibited, not in an inhibited flight phase (FwsCore MEMOs loop) */
function shownSignsMemos(memos: FwsMemos, flightPhase: number): string[] {
  return ['335000001', '335000002', '335000004'].filter((code) => {
    const memo = memos.ewdMemos[code];
    return memo.simVarIsActive.get() && !memo.memoInhibit() && !memo.flightPhaseInhib.includes(flightPhase);
  });
}

const ALL_PHASES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/* A380 FCOM DSC-33-50-10 SIGNS MEMO (a380_fcom.txt l.84110-84118) */
describe('A380X SEAT BELTS, NO SMOKING and SIGNS ON memos', () => {
  it('"The flight crew sets the SEAT BELTS sw to ON": SEAT BELTS memo, SIGNS ON in phases 2, 9 and 10 (l.84112-84114)', () => {
    const fws = fakeFws();
    const memos = new FwsMemos(fws);
    fws.seatBeltsSwitchOn.set(true);
    for (const phase of ALL_PHASES) {
      expect(shownSignsMemos(memos, phase)).toEqual([2, 9, 10].includes(phase) ? ['335000004'] : ['335000001']);
    }
  });

  it('"The flight crew sets the NO SMOKING sw to ON": NO SMOKING memo, SIGNS ON in phases 2, 9 and 10 (l.84116-84118)', () => {
    const fws = fakeFws();
    const memos = new FwsMemos(fws);
    fws.noSmokingSwitchOn.set(true);
    for (const phase of ALL_PHASES) {
      expect(shownSignsMemos(memos, phase)).toEqual([2, 9, 10].includes(phase) ? ['335000004'] : ['335000002']);
    }
  });

  it('both switches ON: both memos, one SIGNS ON memo in phases 2, 9 and 10', () => {
    const fws = fakeFws();
    const memos = new FwsMemos(fws);
    fws.seatBeltsSwitchOn.set(true);
    fws.noSmokingSwitchOn.set(true);
    expect(shownSignsMemos(memos, 8)).toEqual(['335000001', '335000002']);
    expect(shownSignsMemos(memos, 9)).toEqual(['335000004']);
  });

  it('no memo with both switches at AUTO or OFF', () => {
    const memos = new FwsMemos(fakeFws());
    for (const phase of ALL_PHASES) {
      expect(shownSignsMemos(memos, phase)).toEqual([]);
    }
  });

  it('has the NO SMOKING and SIGNS ON texts, and no NO MOBILE memo (not in this FCOM)', () => {
    // read from the source: importing EcamMessages/index.ts in a test fails (circular import, FwsCdsDuFault.spec.ts)
    const ecamMessages = readFileSync(
      resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/index.ts'),
      'utf-8',
    );
    expect(ecamMessages).toMatch(/'335000002': '.*NO SMOKING',/);
    expect(ecamMessages).toMatch(/'335000004': '.*SIGNS ON',/);
    expect(ecamMessages).not.toContain('NO MOBILE');
    expect(new FwsMemos(fakeFws()).ewdMemos['335000003']).toBeUndefined();
  });
});
