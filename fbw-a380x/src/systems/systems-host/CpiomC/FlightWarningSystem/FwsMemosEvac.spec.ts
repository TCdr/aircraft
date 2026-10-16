// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Subject } from '@microsoft/msfs-sdk';
import { describe, expect, it } from 'vitest';
import type { FwsCore } from './FwsCore';
import { FwsMemos } from './FwsMemos';

/** An FwsCore stand-in: every signal FwsMemos reads is a Subject (false, or 0 for the counters) */
function fakeFws(): FwsCore & { evacCommand: Subject<boolean> } {
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
  ) as unknown as FwsCore & { evacCommand: Subject<boolean> };
}

/*
 * A380 FCOM DSC-23-20 EVAC panel, COMMAND pb-sw (a380_fcom.txt l.49145-49149): "The Flight Crew orders an evacuation,
 * regardless of the CAPT and PURS sw position (CAPT or CAPT & PURS). When pressed: - The ON light and the EVAC light
 * flashes - Message EVAC ACTIVE is displayed on the ECAM".
 */
describe('A380X EVAC ACTIVE memo', () => {
  it('is an ECAM memo text', () => {
    // read from the source: importing EcamMessages/index.ts in a test fails (circular import, FwsCdsDuFault.spec.ts)
    const ecamMessages = readFileSync(
      resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/index.ts'),
      'utf-8',
    );
    expect(ecamMessages).toMatch(/'230000016': '.*EVAC ACTIVE',/);
  });

  it('is shown while the EVAC COMMAND pb-sw is ON, in every flight phase', () => {
    const fws = fakeFws();
    const memo = new FwsMemos(fws).ewdMemos['230000016'];
    expect(memo).toBeDefined();
    expect(memo.flightPhaseInhib).toEqual([]);
    expect(memo.codesToReturn).toEqual(['230000016']);

    expect(memo.simVarIsActive.get()).toBe(false);
    fws.evacCommand.set(true);
    expect(memo.simVarIsActive.get()).toBe(true);
    fws.evacCommand.set(false);
    expect(memo.simVarIsActive.get()).toBe(false);
  });
});
