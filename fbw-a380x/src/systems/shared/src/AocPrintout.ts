// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** A printout of an OIS application on the pedestal printer, with the title printed above its text */
export interface AocPrintout {
  readonly text: string;
  /** AOC MESSAGE when not given */
  readonly title?: string;
  /** The AOC message id of an automatic printout, told back with aocPrintoutPrinted once printed */
  readonly printId?: number;
}

/**
 * The AOC print event as the A380X uses it: the AOC publishes the plain text of a message, an OIS application may
 * publish a printout with its own title instead.
 */
export interface A380AocPrintEvents {
  aocPrintMessage: string | AocPrintout;
  /** The printer printed the automatic printout of this AOC message */
  aocPrintoutPrinted: number;
}
