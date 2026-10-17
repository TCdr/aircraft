// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { Arinc429Register, Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import {
  irsStatusMessage,
  isSetHeadingFieldDisplayed,
  parseSetHeadingEntry,
  SET_HEADING_TRANSMISSION_MS,
  SetHeadingTransmitter,
  setHeadingField,
} from './IrsMonitorFields';

/** The IR maintenance word flags (docs/a320-simvars.md, bits numbered from 0) */
const REV_ATT_MODE = 1 << 1;
const NAV_MODE = 1 << 2;
const VALID_SET_HEADING = 1 << 3;
const IR_FAULT = 1 << 8;

/**
 * A maintenance word as the IR writes it.
 * @param flags the flags
 * @param ssm the sign status
 * @returns the word
 */
function maintWord(flags: number, ssm = Arinc429SignStatusMatrix.NormalOperation): Arinc429Register {
  return Arinc429Register.empty().set(Arinc429Word.getRawWord(flags, ssm));
}

describe('MCDU IRS MONITOR page', () => {
  it('asks for a heading while an IR is in ATT mode without one', () => {
    expect(irsStatusMessage(maintWord(REV_ATT_MODE))).toBe('ENTER HEADING');
  });

  it('no longer asks for a heading once the IR in ATT mode holds one', () => {
    expect(irsStatusMessage(maintWord(REV_ATT_MODE | VALID_SET_HEADING))).toBe('');
  });

  it('does not ask for a heading in NAV mode, and shows an IR fault first', () => {
    expect(irsStatusMessage(maintWord(NAV_MODE))).toBe('');
    expect(irsStatusMessage(maintWord(REV_ATT_MODE | IR_FAULT))).toBe('IR FAULT');
    expect(irsStatusMessage(maintWord(0, Arinc429SignStatusMatrix.FailureWarning))).toBe('');
  });

  it('displays the SET HDG field only while at least one IR is in ATT mode', () => {
    expect(isSetHeadingFieldDisplayed([maintWord(NAV_MODE), maintWord(NAV_MODE), maintWord(NAV_MODE)])).toBe(false);
    expect(isSetHeadingFieldDisplayed([maintWord(NAV_MODE), maintWord(REV_ATT_MODE), maintWord(NAV_MODE)])).toBe(true);
    expect(
      isSetHeadingFieldDisplayed([
        maintWord(REV_ATT_MODE, Arinc429SignStatusMatrix.FailureWarning),
        maintWord(NAV_MODE),
        maintWord(NAV_MODE),
      ]),
    ).toBe(false);
  });

  it('shows amber boxes until a heading is entered, then the heading in blue', () => {
    expect(setHeadingField(null)).toEqual(['SET HDG', '___[color]amber']);
    expect(setHeadingField(5)).toEqual(['SET HDG', '005[color]cyan']);
  });

  it('takes headings from 0 to 360, 360 as north', () => {
    expect(parseSetHeadingEntry('275')).toEqual({ heading: 275 });
    expect(parseSetHeadingEntry('360')).toEqual({ heading: 0 });
    expect(parseSetHeadingEntry('361')).toEqual({ error: 'range' });
    expect(parseSetHeadingEntry('27.5')).toEqual({ error: 'format' });
    expect(parseSetHeadingEntry('ABC')).toEqual({ error: 'format' });
  });

  it('sends each entry to the IRs for a short time, so that a repeated entry is a new one', () => {
    vi.useFakeTimers();
    const words: [number, Arinc429SignStatusMatrix][] = [];
    const transmitter = new SetHeadingTransmitter((heading, ssm) => words.push([heading, ssm]));

    transmitter.send(120);
    expect(words).toEqual([[120, Arinc429SignStatusMatrix.NormalOperation]]);
    vi.advanceTimersByTime(SET_HEADING_TRANSMISSION_MS - 1);
    expect(words.length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(words[1]).toEqual([0, Arinc429SignStatusMatrix.NoComputedData]);

    // A new entry while the previous one is still sent restarts the transmission
    transmitter.send(130);
    vi.advanceTimersByTime(SET_HEADING_TRANSMISSION_MS / 2);
    transmitter.send(140);
    vi.advanceTimersByTime(SET_HEADING_TRANSMISSION_MS / 2);
    expect(words[words.length - 1]).toEqual([140, Arinc429SignStatusMatrix.NormalOperation]);
    vi.advanceTimersByTime(SET_HEADING_TRANSMISSION_MS / 2);
    expect(words[words.length - 1]).toEqual([0, Arinc429SignStatusMatrix.NoComputedData]);
    vi.useRealTimers();
  });
});
