// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The MCDU print request and the cockpit printer failure (flyPad 46004, L:A32NX_PRINTER_FAILED written by the
 * systems-host atsu.ts). A320 FCOM DSC-22_20-50-20-38 MCDU messages (a320_fcom.txt l.22912-22918): PRINTER NOT
 * AVAILABLE, type II white, "A printer communication error was detected while printing a report. The printing was
 * terminated." Every print of the A32NX (MCDU pages, AOC/ATC reports, the DCDU PRINT key) goes through printPage.
 */

/** What a print request does */
export enum PrintRequestOutcome {
  /** The printer prints the page */
  Print,
  /** A page is being printed: the request is dropped, as before */
  Busy,
  /** The printer is failed: nothing is printed, PRINTER NOT AVAILABLE */
  PrinterNotAvailable,
}

/**
 * @param printerFailed L:A32NX_PRINTER_FAILED
 * @param printing a page is being printed
 * @returns what the print request does
 */
export function printRequestOutcome(printerFailed: boolean, printing: boolean): PrintRequestOutcome {
  if (printerFailed) {
    return PrintRequestOutcome.PrinterNotAvailable;
  }
  return printing ? PrintRequestOutcome.Busy : PrintRequestOutcome.Print;
}
