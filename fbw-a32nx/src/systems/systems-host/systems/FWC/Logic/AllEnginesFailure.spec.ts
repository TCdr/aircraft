// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { ALL_ENGINES_FAILURE_CODES, allEnginesFailureLines, isApuStartLineShown } from './AllEnginesFailure';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';

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

/* Air Arabia A320 QRH 18-Aug-21 ABN-19.01A ALL ENG FAIL: OPTIMUM RELIGHT SPEED 270/0.77 for the LEAP-1A neo. */
describe('ALL ENGINES FAILURE: lines', () => {
  const allShown = {
    emerElecPwrManOnPushed: false,
    apuStartLineShown: true,
    thrustLeverAboveIdle: true,
    fac1Failed: true,
  };
  const text = (indexes: number[]) => formatEwdMessages(indexes.map((index) => ALL_ENGINES_FAILURE_CODES[index]));

  it('has a message for every line', () => {
    expect(formatEwdMessages(ALL_ENGINES_FAILURE_CODES).every((line) => line !== '')).toBe(true);
  });

  it('shows one OPT RELIGHT SPD line, 270/.77', () => {
    const relight = text(allEnginesFailureLines(allShown)).filter((line) => line.includes('OPT RELIGHT SPD'));
    expect(relight).toHaveLength(1);
    expect(relight[0]).toContain('270/.77');
  });

  it('shows every line in order when all conditions are met', () => {
    expect(allEnginesFailureLines(allShown)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('hides the conditional lines', () => {
    const lines = text(
      allEnginesFailureLines({
        emerElecPwrManOnPushed: true,
        apuStartLineShown: false,
        thrustLeverAboveIdle: false,
        fac1Failed: false,
      }),
    ).join(' | ');
    expect(lines).not.toContain('EMER ELEC PWR');
    expect(lines).not.toContain('-APU');
    expect(lines).not.toContain('THR LEVERS');
    expect(lines).not.toContain('FAC 1');
    expect(lines).toContain('OPT RELIGHT SPD');
    expect(lines).toContain('DIVERSION');
  });
});
