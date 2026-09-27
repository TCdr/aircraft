// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PedestalPrinter } from './PedestalPrinter';

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
