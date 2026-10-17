// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429Register, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';

/**
 * Bits of the IR maintenance word A32NX_ADIRS_IR_{number}_MAINT_WORD (docs/a320-simvars.md), numbered from 1 as
 * Arinc429Register.bitValue counts them (the docs number them from 0).
 */
const IrMaintWordBit = {
  /** REV_ATT_MODE: the mode selector is on ATT */
  AttitudeMode: 2,
  /** VALID_SET_HEADING: the IR in ATT mode holds a heading the crew entered */
  ValidSetHeading: 4,
  IrFault: 9,
  ExcessMotion: 13,
} as const;

/** The FMGC output to the IRs with the heading the crew enters for an IR in ATT mode (Arinc429Word, degrees) */
export const IRS_SET_HEADING_VAR = 'L:A32NX_FM_IRS_SET_HEADING';

/** How long the set heading word stays in normal operation after an entry: each entry is a new word for the IRs */
export const SET_HEADING_TRANSMISSION_MS = 1000;

/**
 * The status message of an IRS on the IRS MONITOR page.
 * ENTER HEADING: the IR is in ATT mode without a heading entered (the crew enters it on the MCDU).
 * @param word the maintenance word of the IR
 * @returns the message, empty without one
 */
export function irsStatusMessage(word: Arinc429Register): string {
  if (word.isInvalid()) {
    return '';
  }
  if (word.bitValueOr(IrMaintWordBit.IrFault, false)) {
    return 'IR FAULT';
  }
  if (word.bitValueOr(IrMaintWordBit.ExcessMotion, false)) {
    return 'EXCESS MOTION';
  }
  if (word.bitValueOr(IrMaintWordBit.AttitudeMode, false) && !word.bitValueOr(IrMaintWordBit.ValidSetHeading, false)) {
    return 'ENTER HEADING';
  }
  return '';
}

/**
 * The [5R] SET HDG field is displayed while at least one IRS is in ATT mode.
 * @param words the maintenance words of IR 1, 2 and 3
 * @returns whether the field is displayed
 */
export function isSetHeadingFieldDisplayed(words: readonly Arinc429Register[]): boolean {
  return words.some((word) => !word.isInvalid() && word.bitValueOr(IrMaintWordBit.AttitudeMode, false));
}

/**
 * The [5R] SET HDG field: the entered heading in blue, else amber boxes.
 * @param enteredHeading the heading the crew entered, in degrees, null without one
 * @returns the label and the value cells of line 5 right
 */
export function setHeadingField(enteredHeading: number | null): [label: string, value: string] {
  const value =
    enteredHeading !== null
      ? `${Math.round(enteredHeading).toFixed(0).padStart(3, '0')}[color]cyan`
      : '___[color]amber';
  return ['SET HDG', value];
}

export type SetHeadingEntry = { heading: number } | { error: 'format' | 'range' };

/**
 * Reads a SET HDG entry: a heading of up to 3 digits from 0 to 360 (360 is north, sent as 0).
 * @param input the scratchpad content
 * @returns the heading, or the error to show
 */
export function parseSetHeadingEntry(input: string): SetHeadingEntry {
  if (!/^\d{1,3}$/.test(input)) {
    return { error: 'format' };
  }
  const heading = parseInt(input, 10);
  if (heading > 360) {
    return { error: 'range' };
  }
  return { heading: heading % 360 };
}

export type SetHeadingWordWriter = (heading: number, ssm: Arinc429SignStatusMatrix) => void;

/**
 * Sends the crew SET HDG entries to the IRs: the word is in normal operation for SET_HEADING_TRANSMISSION_MS after
 * each entry, then no computed data, so that the IRs take each entry once, also a repeated one (the crew has to reset
 * the heading often).
 */
export class SetHeadingTransmitter {
  private endTimer: ReturnType<typeof setTimeout> | null = null;

  /** The timer functions can be replaced in the specs */
  constructor(
    private readonly write: SetHeadingWordWriter,
    private readonly schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout> = setTimeout,
    private readonly cancel: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout,
  ) {}

  /** @param heading degrees */
  public send(heading: number): void {
    if (this.endTimer !== null) {
      // A new entry during the transmission of the previous one: the IRs take a new heading at once, the same
      // heading again is the same entry
      this.cancel(this.endTimer);
    }
    this.write(heading, Arinc429SignStatusMatrix.NormalOperation);
    this.endTimer = this.schedule(() => {
      this.endTimer = null;
      this.write(0, Arinc429SignStatusMatrix.NoComputedData);
    }, SET_HEADING_TRANSMISSION_MS);
  }
}
