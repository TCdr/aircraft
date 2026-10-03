// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRINTER_ABORT_VAR,
  PRINTER_OFF_VAR,
  PRINTER_SLEW_VAR,
  PRINTER_TEST_VAR,
  PedestalPrinter,
  printerTestPage,
} from './PedestalPrinter';

/** The sim variables of a test (the SimVar functions may be the sim's own, reading 0 in the tests) */
const simVars = new Map<string, number | boolean>();

let sheets: string[][];

const lines = (count: number, prefix = 'L') => Array.from({ length: count }, (_, i) => `${prefix}${i}`);

/** Lets the printing variable promise resolve, then the sheet feed time elapse */
const feedSheet = async () => {
  await Promise.resolve();
  await Promise.resolve();
  vi.advanceTimersByTime(2500);
};

beforeEach(() => {
  vi.useFakeTimers();
  simVars.clear();
  vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simVars.get(name) ?? 0);
  vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: number | boolean) => {
    simVars.set(name, value);
    return Promise.resolve();
  });
  sheets = [];
  vi.stubGlobal('RegisterViewListener', () => ({
    triggerToAllSubscribers: (event: string, sheet: string[]) => event === 'A380X_PRINT' && sheets.push(sheet),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('PedestalPrinter', () => {
  it('prints a page of up to 45 lines on one sheet', async () => {
    new PedestalPrinter().print(lines(45));
    await feedSheet();
    expect(sheets).toEqual([lines(45)]);
    expect(simVars.get('L:A32NX_PRINT_LINES')).toBe(45);
    expect(simVars.get('L:A32NX_PAGE_ID')).toBe(1);
    expect(simVars.get('L:A32NX_PRINTER_PRINTING')).toBe(1);
  });

  it('prints a longer page on several sheets, one after the other', async () => {
    const page = lines(100);
    new PedestalPrinter().print(page);
    await Promise.resolve();
    await Promise.resolve();
    expect(sheets).toEqual([page.slice(0, 45)]);
    await feedSheet();
    expect(sheets).toHaveLength(2);
    await feedSheet();
    expect(sheets).toEqual([page.slice(0, 45), page.slice(45, 90), page.slice(90)]);
    expect(simVars.get('L:A32NX_PRINT_LINES')).toBe(10);
    expect(simVars.get('L:A32NX_PAGE_ID')).toBe(3);
  });

  it('prints the pages in their order, after the ones already waiting', async () => {
    const printer = new PedestalPrinter();
    printer.print(lines(2, 'A'));
    printer.print(lines(2, 'B'));
    await feedSheet();
    await feedSheet();
    expect(sheets).toEqual([lines(2, 'A'), lines(2, 'B')]);
  });

  it('puts a sheet still in the printer onto the torn-off sheets', async () => {
    const printer = new PedestalPrinter();
    printer.print(lines(2, 'A'));
    await feedSheet();
    expect(simVars.get('L:A32NX_PAGES_PRINTED') ?? 0).toBe(0);
    printer.print(lines(2, 'B'));
    await feedSheet();
    expect(simVars.get('L:A32NX_PAGES_PRINTED')).toBe(1);
    expect(simVars.get('L:A32NX_PRINT_PAGE_OFFSET')).toBe(0);
  });
});

describe('PedestalPrinter control panel buttons', () => {
  const AC1 = 'L:A32NX_ELEC_AC_1_BUS_IS_POWERED';

  beforeEach(() => {
    simVars.set(AC1, 1);
  });

  it('is available with AC 1 powered and switched on (FCOM DSC-46-20-70 P 1)', () => {
    const printer = new PedestalPrinter();
    expect(printer.isAvailable()).toBe(true);
    simVars.set(PRINTER_OFF_VAR, 1);
    expect(printer.isAvailable()).toBe(false);
    simVars.set(PRINTER_OFF_VAR, 0);
    simVars.set(AC1, 0);
    expect(printer.isAvailable()).toBe(false);
  });

  it('prints the test page on TEST, and clears the request', async () => {
    simVars.set('E:ZULU DAY OF MONTH', 3);
    simVars.set('E:ZULU MONTH OF YEAR', 10);
    simVars.set('E:ZULU YEAR', 2026);
    simVars.set('E:ZULU TIME', 9 * 3600 + 7 * 60);
    simVars.set(PRINTER_TEST_VAR, 1);
    new PedestalPrinter().update();
    await feedSheet();
    expect(sheets).toEqual([printerTestPage(3, 10, 2026, 9 * 3600 + 7 * 60)]);
    expect(simVars.get(PRINTER_TEST_VAR)).toBe(0);
  });

  it('feeds out a blank sheet on SLEW', async () => {
    simVars.set(PRINTER_SLEW_VAR, 1);
    new PedestalPrinter().update();
    await feedSheet();
    expect(sheets).toEqual([['']]);
    expect(simVars.get('L:A32NX_PRINTER_PRINTING')).toBe(1);
    expect(simVars.get(PRINTER_SLEW_VAR)).toBe(0);
  });

  it('drops the waiting sheets on ABORT; the sheet coming out finishes', async () => {
    const printer = new PedestalPrinter();
    const page = lines(100);
    printer.print(page);
    await Promise.resolve();
    await Promise.resolve();
    simVars.set(PRINTER_ABORT_VAR, 1);
    printer.update();
    expect(simVars.get(PRINTER_ABORT_VAR)).toBe(0);
    await feedSheet();
    await feedSheet();
    expect(sheets).toEqual([page.slice(0, 45)]);
    expect(simVars.get('L:A32NX_PRINTER_PRINTING')).toBe(1);
  });

  it('does nothing on TEST or SLEW while off or without AC 1, and drops the waiting sheets', async () => {
    const printer = new PedestalPrinter();
    printer.print(lines(100));
    await Promise.resolve();
    await Promise.resolve();
    simVars.set(PRINTER_OFF_VAR, 1);
    simVars.set(PRINTER_TEST_VAR, 1);
    simVars.set(PRINTER_SLEW_VAR, 1);
    printer.update();
    await feedSheet();
    await feedSheet();
    expect(sheets).toHaveLength(1);
    // The presses while off are not kept for later
    expect(simVars.get(PRINTER_TEST_VAR)).toBe(0);
    expect(simVars.get(PRINTER_SLEW_VAR)).toBe(0);

    simVars.set(PRINTER_OFF_VAR, 0);
    simVars.set(AC1, 0);
    simVars.set(PRINTER_TEST_VAR, 1);
    printer.update();
    await feedSheet();
    expect(sheets).toHaveLength(1);
  });

  it('has a test page of 64-column lines with the date, the time and every pattern character', () => {
    const page = printerTestPage(3, 10, 2026, 9 * 3600 + 7 * 60);
    expect(page[1]).toBe(` PRINTER TEST${' '.repeat(33)}DATE: 03 OCT 26`);
    expect(page[2]).toBe(`${' '.repeat(46)}TIME: 09:07`);
    expect(page.every((l) => l.length <= 64)).toBe(true);
    const pattern = page.slice(5, page.indexOf(' END OF TEST') - 1).join('');
    for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/.:()+*=<>') {
      expect(pattern).toContain(c);
    }
    expect(printerTestPage(1, 0, 2026, -60)[1]).toContain('DATE: 01 --- 26');
    expect(printerTestPage(1, 1, 2026, -60)[2]).toContain('TIME: 23:59');
  });
});
