// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  ALL_ENGINES_FAILURE_CODES,
  allEnginesFailureLines,
  allEnginesFailureStatus,
  isApuStartLineShown,
} from './AllEnginesFailure';
import { pseudoFwcItem, statusLines } from './FwcAlertSpecHelpers';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';

/* The procedure asks for an APU start below FL 250 only. */
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

/* PACK 1(2) OFF: each pack is checked against its own bleed. */
describe('PACK 2 OFF bleed availability', () => {
  it('reads the ENG 2 BLEED pb', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
    expect(fwc).toMatch(/const eng2Bleed = SimVar\.GetSimVarValue\('L:A32NX_OVHD_PNEU_ENG_2_BLEED_PB_IS_AUTO'/);
  });
});

/* OPTIMUM RELIGHT SPEED is 270/0.77 for the LEAP-1A neo. */
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

/* A320 FCOM PRO-ABN-ENG ENG ALL ENGINES FAILURE STATUS (a320_fcom.txt l.79177-79239). */
describe('ALL ENGINES FAILURE STATUS', () => {
  it('shows the FCOM limitations, approach procedure and information, in the FCOM order', () => {
    expect(statusLines(allEnginesFailureStatus()).left).toEqual([
      'MIN RAT SPEED....140 KT',
      'MAX SPEED.......320/.77',
      'MAX BRK PR.....1000 PSI',
      'MANEUVER WITH CARE',
      'FUEL GRVTY FEED',
      'AVOID NEGATIVE G FACTOR',
      'APPR PROC:',
      'FOR LDG......USE FLAP 2',
      'WHEN CONF 2 AND VAPP:',
      'L/G GRVTY EXTN...AS RQRD',
      'ALTN LAW: PROT LOST',
      'WHEN L/G DN: DIRECT LAW',
      'BRK Y ACCU PR ONLY',
      'SLATS SLOW',
      'FLS LIMITED TO F-APP + RAW',
    ]);
  });

  it('shows the FCOM INOP SYS list', () => {
    expect(statusLines(allEnginesFailureStatus()).right).toEqual([
      'INOP SYS',
      'G+Y HYD',
      'F/CTL PROT',
      'STABILIZER',
      'R AIL',
      'REVERSER 1+2',
      'ADR 2+3',
      'IR 2+3',
      'RA 1+2',
      'SPLR 1+2+4+5',
      'ELAC 2',
      'SEC 2+3',
      'FLAPS',
      'YAW DAMPER',
      'A/CALL OUT',
      'AP 1+2',
      'A/THR',
      'FUEL PUMPS',
      'ANTI SKID',
      'N/W STRG',
      'AUTO BRK',
      'CAT 2',
      'L/G RETRACT',
      'CAB PR 1+2',
      'PACK 1+2',
    ]);
  });

  it('is the STATUS of the PseudoFWC ALL ENGINES FAILURE', () => {
    expect(pseudoFwcItem('7700027')).toContain('...alertStatus(allEnginesFailureStatus)');
  });
});
