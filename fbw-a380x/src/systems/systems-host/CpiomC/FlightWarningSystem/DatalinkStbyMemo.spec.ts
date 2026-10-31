// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import type { FwsCore } from './FwsCore';
import { FwsMemos } from './FwsMemos';
import { DATALINK_STBY_MEMO, isDatalinkStby } from './DatalinkStbyMemo';
import { AcarsConnector } from '@datalink/router';
import { EcamMemos } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { A380Failure } from '../../../failures/src/a380';
import { createFws, runFwsCycle } from './FwsSpecFixture';

type DatalinkFws = FwsCore & { datalinkStby: Subject<boolean> };

/** An FwsCore stand-in: every signal FwsMemos reads is a Subject (false, or 0 for the counters) */
function fakeFws(): DatalinkFws {
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
  ) as unknown as DatalinkFws;
}

describe('A380X DATALINK STBY memo', () => {
  it('"Data mode is available, via at least one VHF/HF/SATCOM, but the datalink is temporarily lost."', () => {
    expect(isDatalinkStby({ dataModeAvailable: true, linkTemporarilyLost: true })).toBe(true);
    expect(isDatalinkStby({ dataModeAvailable: true, linkTemporarilyLost: false })).toBe(false);
    // no data mode (VHF 3 in voice or failed): COM DATALINK FAULT, not this memo
    expect(isDatalinkStby({ dataModeAvailable: false, linkTemporarilyLost: true })).toBe(false);
    expect(isDatalinkStby({ dataModeAvailable: false, linkTemporarilyLost: false })).toBe(false);
  });

  it('is a green DATALINK STBY memo of the EWD memo table', () => {
    expect(EcamMemos[DATALINK_STBY_MEMO]).toBe('\x1b<3mDATALINK STBY');
  });

  it('FwsMemos shows it while FwsCore sets the datalink standby state, in all flight phases', () => {
    const fws = fakeFws();
    const memo = new FwsMemos(fws).ewdMemos[DATALINK_STBY_MEMO];
    expect(memo.codesToReturn).toEqual([DATALINK_STBY_MEMO]);
    expect(memo.simVarIsActive.get()).toBe(false);
    fws.datalinkStby.set(true);
    expect(memo.simVarIsActive.get()).toBe(true);
    expect(memo.memoInhibit()).toBe(false);
    expect(memo.flightPhaseInhib).toEqual([]);
  });

  it('FwsCore: data mode = no COM DATALINK FAULT (VHF 3 working, in data mode), link lost = the ACARS provider lost', () => {
    const linkLost = vi.spyOn(AcarsConnector, 'isLinkTemporarilyLost');
    linkLost.mockReturnValue(true);
    const working = createFws(new Set()).core;
    // The memo reads the datalink fault of the previous update
    runFwsCycle(working);
    runFwsCycle(working);
    expect(working.comDatalinkFault.get()).toBe(false);
    expect(working.datalinkStby.get()).toBe(true);

    linkLost.mockReturnValue(false);
    runFwsCycle(working);
    expect(working.datalinkStby.get()).toBe(false);

    linkLost.mockReturnValue(true);
    const vhf3Failed = createFws(new Set([A380Failure.Vhf3])).core;
    runFwsCycle(vhf3Failed);
    runFwsCycle(vhf3Failed);
    expect(vhf3Failed.comDatalinkFault.get()).toBe(true);
    expect(vhf3Failed.datalinkStby.get()).toBe(false);
    linkLost.mockRestore();
  });
});
