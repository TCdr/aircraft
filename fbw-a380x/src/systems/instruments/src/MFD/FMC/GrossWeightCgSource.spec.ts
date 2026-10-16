// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { grossWeightCgFromFqmsOrWbbc } from './GrossWeightCgSource';

const word = (value: number, ssm: Arinc429SignStatusMatrix) => new Arinc429Word(Arinc429Word.getRawWord(value, ssm));

describe('FMS gross weight CG source (A380 FCOM DSC-28-10 l.57741-57744)', () => {
  it('uses the FQMS CG, the WBBC CG when the FQMS gives none, null without both', () => {
    const fqms = word(38.5, Arinc429SignStatusMatrix.NormalOperation);
    const wbbc = word(40, Arinc429SignStatusMatrix.NormalOperation);
    const noData = word(0, Arinc429SignStatusMatrix.NoComputedData);
    expect(grossWeightCgFromFqmsOrWbbc(fqms, wbbc)).toBe(38.5);
    expect(grossWeightCgFromFqmsOrWbbc(noData, wbbc)).toBe(40);
    expect(grossWeightCgFromFqmsOrWbbc(noData, noData)).toBe(null);
  });
});
