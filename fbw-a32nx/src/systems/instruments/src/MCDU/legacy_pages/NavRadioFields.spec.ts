// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { adfBfoAction, adfBfoCell } from './NavRadioFields';

const noAdf = { frequency: null, bfo: false };
const adf = { frequency: 350, bfo: false };
const adfInBfo = { frequency: 350, bfo: true };

// A320 FCOM DSC-22_20-50-10-28 RADIO NAV page, a320_fcom.txt l.21508-21509, l.21521-21523
describe('MCDU RADIO NAV page ADF/BFO prompts', () => {
  it('shows no prompt without a tuned ADF', () => {
    expect(adfBfoCell(1, noAdf)).toBe('');
    expect(adfBfoCell(2, noAdf)).toBe('');
  });

  it('shows the ADF1/BFO and BFO/ADF2 prompts with their arrow for a tuned ADF', () => {
    expect(adfBfoCell(1, adf)).toBe('{ADF1/BFO[color]cyan');
    expect(adfBfoCell(2, adf)).toBe('BFO/ADF2}[color]cyan');
  });

  it('erases the arrow in BFO mode', () => {
    expect(adfBfoCell(1, adfInBfo)).toBe('ADF1/BFO[color]cyan');
    expect(adfBfoCell(2, adfInBfo)).toBe('BFO/ADF2[color]cyan');
  });

  it('activates the BFO with a key press, a clear action cancels it', () => {
    expect(adfBfoAction('', false, adf)).toBe('activate');
    expect(adfBfoAction('CLR', true, adfInBfo)).toBe('cancel');
  });

  it('refuses the key without a tuned ADF, with an entry, or a clear without BFO', () => {
    expect(adfBfoAction('', false, noAdf)).toBe('notAllowed');
    expect(adfBfoAction('350', false, adf)).toBe('notAllowed');
    expect(adfBfoAction('CLR', true, adf)).toBe('notAllowed');
  });
});
