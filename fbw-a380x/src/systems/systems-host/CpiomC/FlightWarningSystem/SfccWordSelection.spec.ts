// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { selectSfccPositionWord } from './SfccWordSelection';

const word = (value: number, ssm = Arinc429SignStatusMatrix.NormalOperation) =>
  new Arinc429Word(Arinc429Word.getRawWord(value, ssm));

/* A380 FCOM DSC-27-10-10 SFCC (a380_fcom.txt l.54523): "Any slats or flaps control unit can provide the position of all
 * the slats and flaps." */
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

  it('is the source of the FwsCore flap and slat CONFIG signals (no SFCC 1 only read left)', () => {
    const fwsCore = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
    expect(fwsCore).not.toMatch(/const (flaps|slats)Pos = Arinc429Word\.fromSimVarValue\('L:A32NX_SFCC_1/);
    expect(fwsCore).toMatch(/const flapsPos = selectSfccPositionWord\(/);
    expect(fwsCore).toMatch(/const slatsPos = selectSfccPositionWord\(/);
    expect(fwsCore).toContain("Arinc429Word.fromSimVarValue('L:A32NX_SFCC_2_FLAP_ACTUAL_POSITION_WORD')");
    expect(fwsCore).toContain("Arinc429Word.fromSimVarValue('L:A32NX_SFCC_2_SLAT_ACTUAL_POSITION_WORD')");
  });
});
