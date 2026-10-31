// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429Register, Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { EcamMemos } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws, runFwsCycle, withoutEcamCodes } from './FwsSpecFixture';
import { IR_ATT_ALIGN_MEMO_CODES, irAttAlignMemoIndex, isIrInAttAlign } from './IrAttAlignMemo';

/** Text of an EcamMemos line, without its ECAM colour code */
function memoText(key: string): string | undefined {
  const line = EcamMemos[key];
  return line === undefined ? undefined : withoutEcamCodes(line);
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

  describe('in the FWS', () => {
    const { core, simVars } = createFws(new Set());

    /** Puts an IR (1, 2, 3) in ATT alignment (ATT mode, pitch NCD), or back to a failed one */
    const setIrInAttAlign = (ir: number, inAttAlign: boolean) => {
      simVars.set(`L:A32NX_ADIRS_IR_${ir}_MAINT_WORD`, inAttAlign ? maintWord('ATT').rawWord : 0);
      simVars.set(`L:A32NX_ADIRS_IR_${ir}_PITCH`, Arinc429Word.getRawWord(0, Arinc429SignStatusMatrix.NoComputedData));
    };

    /** The memo text the FWS shows for the IR IN ATT ALIGN memo item, or undefined when it is not active */
    const shownMemo = (): string | undefined => {
      runFwsCycle(core);
      const memo = core.memos.ewdMemos['340002701'];
      if (!memo.simVarIsActive.get() || memo.memoInhibit()) {
        return undefined;
      }
      return memoText(memo.codesToReturn[memo.whichCodeToReturn()[0]]);
    };

    it('the memo shows the IRs in ATT alignment, ALL IRs IN ATT ALIGN with the three', () => {
      expect(shownMemo()).toBeUndefined();
      setIrInAttAlign(2, true);
      expect(shownMemo()).toBe('IR 2 IN ATT ALIGN');
      setIrInAttAlign(3, true);
      expect(shownMemo()).toBe('IR 2+3 IN ATT ALIGN');
      setIrInAttAlign(1, true);
      expect(shownMemo()).toBe('ALL IRs IN ATT ALIGN');
    });

    it('sets the three IR states from their maintenance and pitch words', () => {
      [1, 2, 3].forEach((ir) => setIrInAttAlign(ir, true));
      runFwsCycle(core);
      expect([core.ir1InAttAlign.get(), core.ir2InAttAlign.get(), core.ir3InAttAlign.get()]).toEqual([
        true,
        true,
        true,
      ]);
      setIrInAttAlign(1, false);
      runFwsCycle(core);
      expect([core.ir1InAttAlign.get(), core.ir2InAttAlign.get(), core.ir3InAttAlign.get()]).toEqual([
        false,
        true,
        true,
      ]);
    });
  });
});
