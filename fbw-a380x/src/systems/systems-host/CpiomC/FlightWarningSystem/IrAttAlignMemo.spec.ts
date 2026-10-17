// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import { Arinc429Register, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import type { FwsCore } from './FwsCore';
import { FwsMemos } from './FwsMemos';
import { IR_ATT_ALIGN_MEMO_CODES, irAttAlignMemoIndex, isIrInAttAlign } from './IrAttAlignMemo';

/* The EcamMemos table and the FwsCore wiring are read from the source text (EcamMessages/index.ts import cycle) */
const ecamMessages = readFileSync(
  resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/index.ts'),
  'utf-8',
);
const fwsCore = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');

/** Text of an EcamMemos line, without its ECAM colour code */
function memoText(key: string): string | undefined {
  const start = ecamMessages.indexOf('export const EcamMemos');
  const body = ecamMessages.slice(start, ecamMessages.indexOf('\n};', start));
  const line = body.match(new RegExp(`^\\s*'${key}': '\\\\x1b<\\d+m([^']*)',`, 'm'));
  return line ? line[1] : undefined;
}

/** An IR maintenance word (label 350, adirs.rs IrMaintFlags): bit 2 REV ATT MODE, bit 3 NAV MODE */
function maintWord(mode: 'ATT' | 'NAV', ssm = Arinc429SignStatusMatrix.NormalOperation): Arinc429Register {
  const word = Arinc429Register.empty();
  word.setSsm(ssm);
  word.setBitValue(mode === 'ATT' ? 2 : 3, true);
  return word;
}

/** An IR pitch word: NCD until the IR attitude is aligned (adirs.rs update_attitude_values) */
function pitchWord(ssm: Arinc429SignStatusMatrix): Arinc429Register {
  const word = Arinc429Register.empty();
  word.setSsm(ssm);
  return word;
}

type AttAlignFws = FwsCore & {
  ir1InAttAlign: Subject<boolean>;
  ir2InAttAlign: Subject<boolean>;
  ir3InAttAlign: Subject<boolean>;
};

/** An FwsCore stand-in: every signal FwsMemos reads is a Subject (false, or 0 for the counters) */
function fakeFws(): AttAlignFws {
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
  ) as unknown as AttAlignFws;
}

/** The memo text FwsCore shows for the IR IN ATT ALIGN memo item, or undefined when it is not active */
function shownMemo(memos: FwsMemos): string | undefined {
  const memo = memos.ewdMemos['340002701'];
  if (!memo.simVarIsActive.get() || memo.memoInhibit()) {
    return undefined;
  }
  return memoText(memo.codesToReturn[memo.whichCodeToReturn()[0]]);
}

describe('A380X IR IN ATT ALIGN memos', () => {
  it('an IR is in ATT alignment: mode ATT selected, attitude not yet available', () => {
    const ncd = Arinc429SignStatusMatrix.NoComputedData;
    const normal = Arinc429SignStatusMatrix.NormalOperation;
    expect(isIrInAttAlign(maintWord('ATT'), pitchWord(ncd))).toBe(true);
    // aligned in ATT: the attitude is available
    expect(isIrInAttAlign(maintWord('ATT'), pitchWord(normal))).toBe(false);
    // NAV alignment: the IR IN ALIGN memo, not this one
    expect(isIrInAttAlign(maintWord('NAV'), pitchWord(ncd))).toBe(false);
    // IR off or failed: no valid maintenance word
    expect(isIrInAttAlign(maintWord('ATT', Arinc429SignStatusMatrix.FailureWarning), pitchWord(ncd))).toBe(false);
    expect(isIrInAttAlign(maintWord('ATT'), pitchWord(Arinc429SignStatusMatrix.FailureWarning))).toBe(false);
  });

  it('has the texts: IR 1(2)(3)(1+2)(2+3)(1+3) IN ATT ALIGN and ALL IRs IN ATT ALIGN', () => {
    expect(IR_ATT_ALIGN_MEMO_CODES.map(memoText)).toEqual([
      'IR 1 IN ATT ALIGN',
      'IR 2 IN ATT ALIGN',
      'IR 3 IN ATT ALIGN',
      'IR 1+2 IN ATT ALIGN',
      'IR 1+3 IN ATT ALIGN',
      'IR 2+3 IN ATT ALIGN',
      'ALL IRs IN ATT ALIGN',
    ]);
  });

  it.each([
    [[false, false, false], -1],
    [[true, false, false], 0],
    [[false, true, false], 1],
    [[false, false, true], 2],
    [[true, true, false], 3],
    [[true, false, true], 4],
    [[false, true, true], 5],
    [[true, true, true], 6],
  ])('IRs in ATT alignment %j: memo %i', (irs, index) => {
    expect(irAttAlignMemoIndex(irs)).toBe(index);
  });

  it('the memo shows the IRs in ATT alignment, ALL IRs IN ATT ALIGN with the three', () => {
    const fws = fakeFws();
    const memos = new FwsMemos(fws);
    expect(shownMemo(memos)).toBeUndefined();
    fws.ir2InAttAlign.set(true);
    expect(shownMemo(memos)).toBe('IR 2 IN ATT ALIGN');
    fws.ir3InAttAlign.set(true);
    expect(shownMemo(memos)).toBe('IR 2+3 IN ATT ALIGN');
    fws.ir1InAttAlign.set(true);
    expect(shownMemo(memos)).toBe('ALL IRs IN ATT ALIGN');
  });

  it('FwsCore sets the three IR states from their maintenance and pitch words', () => {
    for (const ir of [1, 2, 3]) {
      expect(fwsCore).toContain(
        `this.ir${ir}InAttAlign.set(isIrInAttAlign(this.ir${ir}MaintWord, this.ir${ir}Pitch));`,
      );
    }
  });
});
