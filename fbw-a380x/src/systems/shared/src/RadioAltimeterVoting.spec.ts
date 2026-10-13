// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { voteRadioAltitude } from './RadioAltimeterVoting';

const normal = (height: number) =>
  new Arinc429Word(Arinc429Word.getRawWord(height, Arinc429SignStatusMatrix.NormalOperation));
const noComputedData = () => new Arinc429Word(Arinc429Word.getRawWord(0, Arinc429SignStatusMatrix.NoComputedData));
const failed = () => new Arinc429Word(Arinc429Word.getRawWord(0, Arinc429SignStatusMatrix.FailureWarning));

/*
 * A380 FCOM DSC-34-10-30 (a380_fcom.txt l.86462-86466): "Both PFD display the same height", the median of three RAs,
 * the average of two, else the remaining one.
 */
describe('voteRadioAltitude', () => {
  it('three RAs: the median', () => {
    const voted = voteRadioAltitude([normal(100), normal(140), normal(120)]);
    expect(voted.isNormalOperation()).toBe(true);
    expect(voted.value).toBe(120);
  });

  it('two RAs: the average, whichever RA is lost', () => {
    expect(voteRadioAltitude([normal(100), normal(120), failed()]).value).toBe(110);
    expect(voteRadioAltitude([failed(), normal(100), normal(120)]).value).toBe(110);
    expect(voteRadioAltitude([normal(100), noComputedData(), normal(120)]).value).toBe(110);
    expect(voteRadioAltitude([normal(100), normal(120), failed()]).isNormalOperation()).toBe(true);
  });

  it('one RA: that one', () => {
    expect(voteRadioAltitude([failed(), failed(), normal(130)]).value).toBe(130);
    expect(voteRadioAltitude([noComputedData(), normal(90), failed()]).value).toBe(90);
  });

  it('no usable RA: no computed data before a failure', () => {
    expect(voteRadioAltitude([failed(), noComputedData(), failed()]).isNoComputedData()).toBe(true);
    expect(voteRadioAltitude([failed(), failed(), failed()]).isFailureWarning()).toBe(true);
  });
});
