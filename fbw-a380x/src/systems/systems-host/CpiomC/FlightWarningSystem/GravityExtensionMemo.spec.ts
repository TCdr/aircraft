// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429Register, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import { EcamMemos } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws, runFwsCycle } from './FwsSpecFixture';
import {
  GRAVITY_EXTENSION_MEMO,
  GRAVITY_EXTENSION_MEMO_PHASE_INHIBITION,
  isGravityExtensionMemoShown,
} from './GravityExtensionMemo';

describe('L/G GRVTY EXTN memo', () => {
  it('shows once the gears are down and locked with the L/G GRVTY sw at DOWN', () => {
    expect(isGravityExtensionMemoShown(2, true)).toBe(true);
    // extension in progress
    expect(isGravityExtensionMemoShown(2, false)).toBe(false);
    // normal extension (sw OFF) and after the RESET
    expect(isGravityExtensionMemoShown(1, true)).toBe(false);
    expect(isGravityExtensionMemoShown(0, true)).toBe(false);
  });

  it('is inhibited in the phases 3 to 7', () => {
    expect(GRAVITY_EXTENSION_MEMO_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7]);
  });

  it('is the green memo 321000002 of EcamMemos', () => {
    expect(GRAVITY_EXTENSION_MEMO).toBe('321000002');
    expect(EcamMemos['321000002']).toBe('\x1b<3mL/G GRVTY EXTN');
  });

  describe('in the FWS', () => {
    const { core, simVars } = createFws(new Set());

    it('is the memo of the gravity extension signal, with its flight phase inhibition', () => {
      const memo = core.memos.ewdMemos[GRAVITY_EXTENSION_MEMO];
      expect(memo.simVarIsActive).toBe(core.gravityExtensionMemo);
      expect(memo.flightPhaseInhib).toBe(GRAVITY_EXTENSION_MEMO_PHASE_INHIBITION);
      expect(memo.codesToReturn).toEqual([GRAVITY_EXTENSION_MEMO]);
    });

    it('comes on with the L/G GRVTY sw at DOWN and the gears downlocked per the LGCIUs', () => {
      const gearDownlocked = Arinc429Register.empty();
      gearDownlocked.setSsm(Arinc429SignStatusMatrix.NormalOperation);
      for (const bit of [23, 24, 25]) {
        gearDownlocked.setBitValue(bit, true);
      }
      simVars.set('L:A32NX_LGCIU_1_DISCRETE_WORD_1', gearDownlocked.rawWord);
      simVars.set('L:A32NX_LG_GRVTY_SWITCH_POS', 1);
      runFwsCycle(core);
      expect(core.gravityExtensionMemo.get()).toBe(false);

      simVars.set('L:A32NX_LG_GRVTY_SWITCH_POS', 2);
      runFwsCycle(core);
      expect(core.gravityExtensionMemo.get()).toBe(true);
    });
  });
});
