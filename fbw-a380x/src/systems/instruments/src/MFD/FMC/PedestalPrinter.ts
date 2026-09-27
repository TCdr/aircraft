// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

/**
 * The cockpit printer on the pedestal: prints the FMS pages on paper, sheet after sheet. The paper of the cockpit model
 * is drawn by the A380X/Printer cockpit display (PRINT and PRINT_STATIC textures), and the cockpit behaviours
 * (A32NX_Interior_Printer.xml) feed, collect, page through and discard the sheets with the L:A32NX_PRINTER_PRINTING,
 * L:A32NX_PAGE_ID, L:A32NX_PAGES_PRINTED and L:A32NX_PRINT_PAGE_OFFSET variables, as in the A32NX.
 */
export class PedestalPrinter {
  /** The lines of one sheet: a longer page is printed on several sheets */
  private static readonly SHEET_LINES = 45;

  /** The time a sheet takes to come out of the printer, before the next one */
  private static readonly SHEET_FEED_MS = 2500;

  private readonly listener = RegisterViewListener('JS_LISTENER_SIMVARS', undefined, true);

  private readonly sheets: string[][] = [];

  private feeding = false;

  /** Prints a page, after the pages already waiting */
  public print(lines: readonly string[]): void {
    for (let i = 0; i < lines.length; i += PedestalPrinter.SHEET_LINES) {
      this.sheets.push(lines.slice(i, i + PedestalPrinter.SHEET_LINES));
    }
    this.feedNextSheet();
  }

  private feedNextSheet(): void {
    if (this.feeding) {
      return;
    }
    const sheet = this.sheets.shift();
    if (sheet === undefined) {
      return;
    }
    this.feeding = true;

    // A sheet still in the printer goes onto the torn-off sheets
    if (SimVar.GetSimVarValue('L:A32NX_PRINTER_PRINTING', 'bool') === 1) {
      SimVar.SetSimVarValue(
        'L:A32NX_PAGES_PRINTED',
        'number',
        SimVar.GetSimVarValue('L:A32NX_PAGES_PRINTED', 'number') + 1,
      );
      SimVar.SetSimVarValue('L:A32NX_PRINT_PAGE_OFFSET', 'number', 0);
    }
    SimVar.SetSimVarValue('L:A32NX_PRINT_LINES', 'number', sheet.length);
    SimVar.SetSimVarValue('L:A32NX_PAGE_ID', 'number', SimVar.GetSimVarValue('L:A32NX_PAGE_ID', 'number') + 1);
    SimVar.SetSimVarValue('L:A32NX_PRINTER_PRINTING', 'bool', 0).then(() => {
      this.listener.triggerToAllSubscribers('A380X_PRINT', sheet);
      setTimeout(() => {
        SimVar.SetSimVarValue('L:A32NX_PRINTER_PRINTING', 'bool', 1);
        this.feeding = false;
        this.feedNextSheet();
      }, PedestalPrinter.SHEET_FEED_MS);
    });
  }
}
