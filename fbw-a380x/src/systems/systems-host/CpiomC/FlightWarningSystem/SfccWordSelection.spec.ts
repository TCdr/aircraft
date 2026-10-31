// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { createFws, runFwsCycle } from './FwsSpecFixture';
import { selectSfccPositionWord } from './SfccWordSelection';

const word = (value: number, ssm = Arinc429SignStatusMatrix.NormalOperation) =>
  new Arinc429Word(Arinc429Word.getRawWord(value, ssm));

/* Any slat or flap control unit can give the position of all the slats and flaps */
describe('A380X FWS slat/flap position source', () => {
  it('reads SFCC 1 while it gives the position', () => {
    expect(selectSfccPositionWord(word(1), false, word(2), false).value).toBe(1);
  });

  it('reads SFCC 2 when the SFCC 1 word is not valid', () => {
    const sfcc1 = word(1, Arinc429SignStatusMatrix.FailureWarning);
    expect(selectSfccPositionWord(sfcc1, false, word(2), false).value).toBe(2);
    expect(selectSfccPositionWord(word(1, Arinc429SignStatusMatrix.NoComputedData), false, word(2), false).value).toBe(
      2,
    );
  });

  it('reads SFCC 2 when the SFCC 1 channel reports a fault', () => {
    expect(selectSfccPositionWord(word(1), true, word(2), false).value).toBe(2);
  });

  it('keeps SFCC 1 when SFCC 2 cannot give the position either', () => {
    expect(selectSfccPositionWord(word(1), true, word(2), true).value).toBe(1);
    expect(selectSfccPositionWord(word(1), true, word(2, Arinc429SignStatusMatrix.FailureWarning), false).value).toBe(
      1,
    );
  });

  describe('in the FWS flap and slat CONFIG signals', () => {
    const normal = Arinc429SignStatusMatrix.NormalOperation;
    const failed = Arinc429SignStatusMatrix.FailureWarning;

    /** The FWS signals "flaps above 17 deg" and "slats below 20 deg" for the given SFCC position words */
    function configSignals(
      sfcc1: { flaps: number; slats: number; ssm: Arinc429SignStatusMatrix },
      sfcc2Flaps: number,
      sfcc2Slats: number,
    ) {
      const { core, simVars } = createFws(new Set());
      simVars.set('L:A32NX_SFCC_1_FLAP_ACTUAL_POSITION_WORD', Arinc429Word.getRawWord(sfcc1.flaps, sfcc1.ssm));
      simVars.set('L:A32NX_SFCC_1_SLAT_ACTUAL_POSITION_WORD', Arinc429Word.getRawWord(sfcc1.slats, sfcc1.ssm));
      simVars.set('L:A32NX_SFCC_2_FLAP_ACTUAL_POSITION_WORD', Arinc429Word.getRawWord(sfcc2Flaps, normal));
      simVars.set('L:A32NX_SFCC_2_SLAT_ACTUAL_POSITION_WORD', Arinc429Word.getRawWord(sfcc2Slats, normal));
      runFwsCycle(core);
      return [core.flapsSuperiorTo17Deg.get(), core.slatsInferiorTo20Deg.get()];
    }

    it('reads SFCC 2 while SFCC 1 gives no valid position', () => {
      expect(configSignals({ flaps: 100, slats: 400, ssm: failed }, 300, 200)).toEqual([true, true]);
    });

    it('reads SFCC 1 while it gives the position', () => {
      expect(configSignals({ flaps: 100, slats: 400, ssm: normal }, 300, 200)).toEqual([false, false]);
    });
  });
});
