// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { describe, expect, it } from 'vitest';
import type { FwsCore } from './FwsCore';
import { FwsMemos } from './FwsMemos';
import { EcamMemos } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws } from './FwsSpecFixture';

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

describe('A380X SEAT BELTS, NO SMOKING and SIGNS ON memos', () => {
  it('"The flight crew sets the SEAT BELTS sw to ON": SEAT BELTS memo, SIGNS ON in phases 2, 9 and 10', () => {
    const fws = fakeFws();
    const memos = new FwsMemos(fws);
    fws.seatBeltsSwitchOn.set(true);
    for (const phase of ALL_PHASES) {
      expect(shownSignsMemos(memos, phase)).toEqual([2, 9, 10].includes(phase) ? ['335000004'] : ['335000001']);
    }
  });

  it('"The flight crew sets the NO SMOKING sw to ON": NO SMOKING memo, SIGNS ON in phases 2, 9 and 10', () => {
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

  it('has the NO SMOKING and SIGNS ON texts, and no NO MOBILE memo (not on this aircraft)', () => {
    expect(EcamMemos['335000002']).toMatch(/NO SMOKING$/);
    expect(EcamMemos['335000004']).toMatch(/SIGNS ON$/);
    expect(Object.values(EcamMemos).some((text) => text.includes('NO MOBILE'))).toBe(false);
    expect(new FwsMemos(fakeFws()).ewdMemos['335000003']).toBeUndefined();
  });
  it('the FWS takes the switch positions from the cockpit L:vars (position 0 = ON)', () => {
    const { core, simVars } = createFws();
    core.startupCompleted.set(true);
    simVars.set('L:XMLVAR_SWITCH_OVHD_INTLT_SEATBELT_Position', 1);
    simVars.set('L:XMLVAR_SWITCH_OVHD_INTLT_NOSMOKING_Position', 1);
    core.update(1000);
    expect(core.seatBeltsSwitchOn.get()).toBe(false);
    expect(core.noSmokingSwitchOn.get()).toBe(false);
    simVars.set('L:XMLVAR_SWITCH_OVHD_INTLT_SEATBELT_Position', 0);
    core.update(1000);
    expect(core.seatBeltsSwitchOn.get()).toBe(true);
    expect(core.noSmokingSwitchOn.get()).toBe(false);
  });
});
