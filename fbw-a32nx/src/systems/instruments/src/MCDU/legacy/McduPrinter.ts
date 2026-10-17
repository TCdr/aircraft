// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The MCDU print request and the cockpit printer failure (flyPad 46004, L:A32NX_PRINTER_FAILED written by the
 * systems-host atsu.ts): a failed printer stops the print and shows PRINTER NOT AVAILABLE (type II, white). Every print
 * of the A32NX (MCDU pages, AOC/ATC reports, the DCDU PRINT key) goes through printPage.
 */

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
