// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isApuStartLineShown } from './AllEnginesFailure';

/* A320 FCOM PRO-ABN-ENG ALL ENGINES FAILURE: "APU (BELOW FL 250) ..... START". */
describe('ALL ENGINES FAILURE: APU START line', () => {
  it('is shown below FL 250 with the APU off, also far above 2 500 ft RA', () => {
    expect(isApuStartLineShown(false, false, 20_000)).toBe(true);
  });

  it('is hidden above FL 250', () => {
    expect(isApuStartLineShown(false, false, 30_000)).toBe(false);
  });

  it('is hidden once the APU MASTER SW is on or the APU is available', () => {
    expect(isApuStartLineShown(true, false, 10_000)).toBe(false);
    expect(isApuStartLineShown(false, true, 10_000)).toBe(false);
  });

  it('the DUAL ENGINE FAILURE alert uses the rule, no longer the radio altitude', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
    const start = fwc.indexOf('    7700027: {');
    const block = fwc.slice(start, fwc.indexOf('\n    },', start));
    expect(block).toContain('isApuStartLineShown(');
    expect(block).not.toContain('radioAlt');
  });
});

/* A320 FCOM PRO-ABN-AIR PACK 1(2) OFF: each pack is checked against its own bleed. */
describe('PACK 2 OFF bleed availability', () => {
  it('reads the ENG 2 BLEED pb', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
    expect(fwc).toMatch(/const eng2Bleed = SimVar\.GetSimVarValue\('L:A32NX_OVHD_PNEU_ENG_2_BLEED_PB_IS_AUTO'/);
  });
});
