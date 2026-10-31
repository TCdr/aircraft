// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The MCDU print request and the cockpit printer failure (flyPad 46004, L:A32NX_PRINTER_FAILED written by the
 * systems-host atsu.ts): a failed printer stops the print and shows PRINTER NOT AVAILABLE (type II, white). Every print
 * of the A32NX (MCDU pages, AOC/ATC reports, the DCDU PRINT key) goes through printPage.
 */

import { NXSystemMessages, TypeIIMessage } from '../messages/NXSystemMessages';

export enum PrintRequestOutcome {
  Print,
  /** A page is being printed: the request is dropped */
  Busy,
  /** The printer is failed: nothing is printed, PRINTER NOT AVAILABLE */
  PrinterNotAvailable,
}

/**
 * @param printerFailed L:A32NX_PRINTER_FAILED
 * @param printing a page is being printed
 */
export function printRequestOutcome(printerFailed: boolean, printing: boolean): PrintRequestOutcome {
  if (printerFailed) {
    return PrintRequestOutcome.PrinterNotAvailable;
  }
  return printing ? PrintRequestOutcome.Busy : PrintRequestOutcome.Print;
}

/**
 * Decides a print request and, for a failed printer, queues PRINTER NOT AVAILABLE
 * @param printerFailed L:A32NX_PRINTER_FAILED
 * @param printing a page is being printed
 * @param queueMessage queues a message on the MCDU scratchpad
 * @returns the page may be printed
 */
export function requestPrint(
  printerFailed: boolean,
  printing: boolean,
  queueMessage: (message: TypeIIMessage) => void,
): boolean {
  const outcome = printRequestOutcome(printerFailed, printing);
  if (outcome === PrintRequestOutcome.PrinterNotAvailable) {
    queueMessage(NXSystemMessages.printerNotAvailable);
  }
  return outcome === PrintRequestOutcome.Print;
}
