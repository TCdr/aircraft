// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  SLAT_FLAP_CHANNEL_FAULT_PHASE_INHIBITION,
  SfccStatusWord,
  flapSysFaultStatus,
  selectSfccPositionWord,
  slatFlapChannelFaults,
  slatSysFaultStatus,
} from './SlatFlapChannelAlerts';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';

/** The texts of the left column of the STATUS page for these codes, without their colour codes */
function statusTexts(codes: string[]): string[] {
  // eslint-disable-next-line no-control-regex
  const colourCode = /\x1b<\dm/g;
  return formatStatusPage(codes, [])
    .left.split('\r')
    .map((line) => line.replace(colourCode, ''));
}

/** A status word with the given bits set; an invalid word (SFCC unpowered) returns the default value of bitValueOr */
function statusWord(bits: number[], valid = true): SfccStatusWord {
  return { bitValueOr: (bit, valueIfInvalid) => (valid ? bits.includes(bit) : valueIfInvalid) };
}

describe('F/CTL FLAP(SLAT) SYS 1(2) FAULT', () => {
  it('raises nothing without a channel fault', () => {
    expect(slatFlapChannelFaults(statusWord([17, 28, 29]), statusWord([17, 28, 29]))).toEqual({
      flapSysFault: [false, false],
      slatSysFault: [false, false],
    });
  });

  it('raises FLAP SYS 1(2) FAULT on the flap fault bit 12 of SFCC 1(2)', () => {
    expect(slatFlapChannelFaults(statusWord([12]), statusWord([])).flapSysFault).toEqual([true, false]);
    expect(slatFlapChannelFaults(statusWord([]), statusWord([12])).flapSysFault).toEqual([false, true]);
    expect(slatFlapChannelFaults(statusWord([12]), statusWord([])).slatSysFault).toEqual([false, false]);
  });

  it('raises SLAT SYS 1(2) FAULT on the slat fault bit 11 of SFCC 1(2)', () => {
    expect(slatFlapChannelFaults(statusWord([11]), statusWord([])).slatSysFault).toEqual([true, false]);
    expect(slatFlapChannelFaults(statusWord([]), statusWord([11])).slatSysFault).toEqual([false, true]);
  });

  it('does not raise them for an unpowered SFCC (no status word, ELEC alerts cover it)', () => {
    expect(slatFlapChannelFaults(statusWord([], false), statusWord([], false))).toEqual({
      flapSysFault: [false, false],
      slatSysFault: [false, false],
    });
  });

  it('is inhibited in phases 3, 4, 5, 7 and 8', () => {
    expect(SLAT_FLAP_CHANNEL_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 7, 8]);
  });

  it('shows the FLAP SYS 1 FAULT STATUS with the APPR PROC GPWS FLAP MODE OFF', () => {
    const status = flapSysFaultStatus(1);
    expect(statusTexts(status.left)).toEqual([
      'APPR PROC:',
      'GPWS FLAP MODE......OFF',
      'ENG 1 APPR IDLE ONLY',
      'FLAPS SLOW',
    ]);
    expect(status.inopSys).toEqual([]);
  });

  it('shows the FLAP SYS 2 FAULT STATUS without APPR PROC', () => {
    const status = flapSysFaultStatus(2);
    expect(statusTexts(status.left)).toEqual(['ENG 2 APPR IDLE ONLY', 'FLAPS SLOW']);
  });

  it('shows SLATS SLOW for SLAT SYS 1(2) FAULT', () => {
    expect(statusTexts(slatSysFaultStatus().left)).toEqual(['SLATS SLOW']);
  });
});

describe('PseudoFWC F/CTL FLAP(SLAT) SYS 1(2) FAULT', () => {
  const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
  const messages = readFileSync(resolve(__dirname, '../../../../shared/src/EwdMessages.ts'), 'utf-8');

  function alert(code: string): string {
    const start = fwc.indexOf(`    ${code}: {`);
    expect(start, `alert ${code}`).toBeGreaterThan(0);
    return fwc.substring(start, fwc.indexOf('\n    },', start));
  }

  it.each([
    ['2701110', 'flapSys1Fault', "['270111001']", ' FLAP SYS 1 FAULT', 'flapSysFaultStatus(1)'],
    ['2701120', 'flapSys2Fault', "['270112001']", ' FLAP SYS 2 FAULT', 'flapSysFaultStatus(2)'],
    ['2701130', 'slatSys1Fault', "['270113001']", ' SLAT SYS 1 FAULT', 'slatSysFaultStatus()'],
    ['2701140', 'slatSys2Fault', "['270114001']", ' SLAT SYS 2 FAULT', 'slatSysFaultStatus()'],
  ])('%s is a crew awareness F/CTL caution on %s', (code, subject, codes, title, status) => {
    const item = alert(code);
    expect(item).toContain(`simVarIsActive: this.${subject},`);
    expect(item).toContain('flightPhaseInhib: SLAT_FLAP_CHANNEL_FAULT_PHASE_INHIBITION,');
    expect(item).toContain('failure: 1,');
    expect(item).toContain(`codesToReturn: ${codes},`);
    expect(item).toContain(`statusInfo: () => ${status}.left,`);
    expect(messages).toContain(`['${codes.substring(2, 11)}', { group: 'F/CTL$6', text: '${title}' }],`);
  });

  it('reads both SFCC status words each cycle', () => {
    expect(fwc).toContain("Arinc429Word.fromSimVarValue('L:A32NX_SFCC_1_SLAT_FLAP_SYSTEM_STATUS_WORD');");
    expect(fwc).toContain("Arinc429Word.fromSimVarValue('L:A32NX_SFCC_2_SLAT_FLAP_SYSTEM_STATUS_WORD');");
    expect(fwc).toContain('slatFlapChannelFaults(sfcc1SystemStatusWord, sfcc2SystemStatusWord);');
    expect(fwc).toContain('this.flapSys1Fault.set(slatFlapChannels.flapSysFault[0]);');
    expect(fwc).toContain('this.slatSys2Fault.set(slatFlapChannels.slatSysFault[1]);');
  });
});

/* Two SFCCs, each with one slat channel and one flap channel: each position word has two sources. */
describe('FWC flap and slat position source', () => {
  const word = (name: string, valid: boolean) => ({ name, isNormalOperation: () => valid });

  it('uses SFCC 1 when it is valid', () => {
    expect(selectSfccPositionWord(word('sfcc1', true), word('sfcc2', true)).name).toBe('sfcc1');
    expect(selectSfccPositionWord(word('sfcc1', true), word('sfcc2', false)).name).toBe('sfcc1');
  });

  it('uses SFCC 2 when SFCC 1 sends no valid position', () => {
    expect(selectSfccPositionWord(word('sfcc1', false), word('sfcc2', true)).name).toBe('sfcc2');
  });

  it('keeps SFCC 1 when neither is valid', () => {
    expect(selectSfccPositionWord(word('sfcc1', false), word('sfcc2', false)).name).toBe('sfcc1');
  });

  it('PseudoFWC reads the SFCC 2 flap and slat position words too', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
    expect(fwc).toContain("'L:A32NX_SFCC_2_FLAP_ACTUAL_POSITION_WORD'");
    expect(fwc).toContain("'L:A32NX_SFCC_2_SLAT_ACTUAL_POSITION_WORD'");
    expect(fwc).not.toContain('TODO: add switching between SFCC_1 and SFCC_2');
  });
});
