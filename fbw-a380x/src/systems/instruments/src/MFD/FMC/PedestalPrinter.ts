// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

/** The printer is switched off with the ON/OFF button of its control panel (0, the default, is on) */
export const PRINTER_OFF_VAR = 'L:A380X_PRINTER_OFF';
/** Request of the SLEW button: feed paper */
export const PRINTER_SLEW_VAR = 'L:A380X_PRINTER_SLEW';
/** Request of the TEST button: print the test page */
export const PRINTER_TEST_VAR = 'L:A380X_PRINTER_TEST';
/** Request of the ABORT button: cancel the waiting printouts */
export const PRINTER_ABORT_VAR = 'L:A380X_PRINTER_ABORT';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** The characters of the test pattern, all drawn by the printer font */
const TEST_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/.:()+*=<>';

/** The width of a printed line, as the FMS pages */
const TEST_WIDTH = 64;

/**
 * The printer test page (design choice, the FCOM has no test page): the date and time, and a sliding character pattern
 * that shows every character of the printer at every column.
 * @param day the UTC day of the month
 * @param month the UTC month, 1 to 12
 * @param year the UTC year
 * @param utcSeconds the UTC time of the day in seconds
 */
export function printerTestPage(day: number, month: number, year: number, utcSeconds: number): string[] {
  const rule = '='.repeat(TEST_WIDTH);
  const twoDigits = (n: number) => Math.floor(n).toFixed(0).padStart(2, '0');
  const seconds = ((utcSeconds % 86400) + 86400) % 86400;
  const date = `${twoDigits(day)} ${MONTHS[month - 1] ?? '---'} ${twoDigits(year % 100)}`;
  const time = `${twoDigits(seconds / 3600)}:${twoDigits((seconds % 3600) / 60)}`;

  const pattern: string[] = [];
  for (let shift = 0; shift < TEST_CHARACTERS.length; shift += 6) {
    let line = '';
    for (let column = 0; column < TEST_WIDTH; column++) {
      line += TEST_CHARACTERS[(shift + column) % TEST_CHARACTERS.length];
    }
    pattern.push(line);
  }

  return [
    rule,
    ` PRINTER TEST${' '.repeat(33)}DATE: ${date}`,
    `${' '.repeat(46)}TIME: ${time}`,
    rule,
    '',
    ...pattern,
    '',
    ' END OF TEST',
    rule,
  ];
}

/**
 * The cockpit printer on the pedestal: prints the FMS pages on paper, sheet after sheet. The paper of the cockpit model
 * is drawn by the A380X/Printer cockpit display (PRINT and PRINT_STATIC textures), and the cockpit behaviours
 * (A32NX_Interior_Printer.xml) feed, collect, page through and discard the sheets with the L:A32NX_PRINTER_PRINTING,
 * L:A32NX_PAGE_ID, L:A32NX_PAGES_PRINTED and L:A32NX_PRINT_PAGE_OFFSET variables, as in the A32NX.
 *
 * The printer is supplied by AC 1 (FCOM DSC-46-20-70 P 1, NSS AVNCS side printer) and has a control panel of push
 * buttons in the cockpit model (A380_Cockpit_Behavior.xml): ON/OFF (green light when on), SLEW, TEST and ABORT. The A380
 * FCOM does not describe these buttons; their functions are design choices, after the A32NX printer SLEW switch "used to
 * feed paper after having loaded a new roll" (A320 FCOM DSC-45-30 P 2).
 */
export class PedestalPrinter {
  /** The lines of one sheet: a longer page is printed on several sheets */
  private static readonly SHEET_LINES = 45;

  /** The time a sheet takes to come out of the printer, before the next one */
  private static readonly SHEET_FEED_MS = 2500;

  /** The AC 1 bus supplies the pedestal printer (FCOM DSC-46-20-70 P 1) */
  private static readonly POWER_VAR = 'L:A32NX_ELEC_AC_1_BUS_IS_POWERED';

  private readonly listener = RegisterViewListener('JS_LISTENER_SIMVARS', undefined, true);

  private readonly sheets: string[][] = [];

  private feeding = false;

  /** Whether the printer can print: AC 1 powered and the ON/OFF button on */
  public isAvailable(): boolean {
    return (
      SimVar.GetSimVarValue(PedestalPrinter.POWER_VAR, 'bool') > 0 &&
      !(SimVar.GetSimVarValue(PRINTER_OFF_VAR, 'bool') > 0)
    );
  }

  /**
   * Handles the control panel buttons (called by the FMS update loop). A button press is a request variable set to 1 by
   * the cockpit behaviour and cleared here.
   * Design choices (not in the FCOM): ABORT drops the sheets waiting to be printed (the sheet coming out finishes);
   * TEST prints the printer test page; SLEW feeds out a blank sheet of paper; switching the printer off or losing AC 1
   * drops the waiting sheets too.
   */
  public update(): void {
    const available = this.isAvailable();
    const abort = PedestalPrinter.takeRequest(PRINTER_ABORT_VAR);
    const test = PedestalPrinter.takeRequest(PRINTER_TEST_VAR);
    const slew = PedestalPrinter.takeRequest(PRINTER_SLEW_VAR);

    if (!available || abort) {
      this.sheets.length = 0;
    }
    if (!available) {
      return;
    }
    if (test) {
      this.print(
        printerTestPage(
          SimVar.GetSimVarValue('E:ZULU DAY OF MONTH', 'number'),
          SimVar.GetSimVarValue('E:ZULU MONTH OF YEAR', 'number'),
          SimVar.GetSimVarValue('E:ZULU YEAR', 'number'),
          SimVar.GetSimVarValue('E:ZULU TIME', 'seconds'),
        ),
      );
    }
    if (slew) {
      this.print(['']);
    }
  }

  /** Whether a button was pressed: reads and clears its request variable */
  private static takeRequest(name: string): boolean {
    if (SimVar.GetSimVarValue(name, 'bool') > 0) {
      SimVar.SetSimVarValue(name, 'bool', 0);
      return true;
    }
    return false;
  }

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
