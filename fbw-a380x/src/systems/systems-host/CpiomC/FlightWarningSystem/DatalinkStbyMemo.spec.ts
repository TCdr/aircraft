// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import type { FwsCore } from './FwsCore';
import { FwsMemos } from './FwsMemos';
import { DATALINK_STBY_MEMO, isDatalinkStby } from './DatalinkStbyMemo';

/* The EcamMemos table and the FwsCore wiring are read from the source text (EcamMessages/index.ts import cycle) */
const ecamMessages = readFileSync(
  resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/index.ts'),
  'utf-8',
);
const fwsCore = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');

/** Text of an EcamMemos line, with its ECAM colour code */
function memoLine(key: string): string | undefined {
  const start = ecamMessages.indexOf('export const EcamMemos');
  const body = ecamMessages.slice(start, ecamMessages.indexOf('\n};', start));
  const line = body.match(new RegExp(`^\\s*'${key}': '([^']*)',`, 'm'));
  return line ? line[1] : undefined;
}

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
    expect(memoLine(DATALINK_STBY_MEMO)).toBe('\\x1b<3mDATALINK STBY');
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
    expect(fwsCore).toMatch(/dataModeAvailable: !this\.comDatalinkFault\.get\(\)/);
    expect(fwsCore).toMatch(/linkTemporarilyLost: AcarsConnector\.isLinkTemporarilyLost\(\)/);
    expect(fwsCore).toContain('this.datalinkStby.set(');
  });
});
