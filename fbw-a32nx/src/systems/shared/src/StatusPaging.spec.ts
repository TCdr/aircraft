// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  readStatusColumnCodes,
  STATUS_PAGE_ROWS,
  statusLineVar,
  statusPageCount,
  statusPageView,
} from './StatusPaging';

const range = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => `${prefix}${(i + 1).toString().padStart(3, '0')}`);

/** 39 inoperative systems, in the order of the STATUS page: 21 COND, 26 FIRE DET, 28 FUEL, 34 NAV */
const INOP_SYS = [...range('210300', 12), ...range('260300', 9), ...range('280300', 10), ...range('340300', 8)];
const inopSys = (count: number) => INOP_SYS.slice(0, count);

/** Information lines (green) */
const INFORMATION = range('210200', 4);

/** The text rows of a column */
const rows = (column: string) => (column === '' ? [] : column.split('\r'));

describe('A320 ECAM STATUS page overflow (FCOM DSC-31-20 l.46196-46199)', () => {
  it('the SD reads every code the FWC sends, not only the first 16 (DC BUS 1+2: 35 INOP SYS)', () => {
    const vars = new Map<string, number>();
    inopSys(35).forEach((code, i) => vars.set(statusLineVar('RIGHT', i + 1), Number(code)));
    const codes = readStatusColumnCodes('RIGHT', (name) => vars.get(name) ?? 0);
    expect(codes).toEqual(inopSys(35));
    expect(readStatusColumnCodes('LEFT', (name) => vars.get(name) ?? 0)).toEqual([]);
  });

  it('one page holds the INOP SYS title and 16 systems, without the arrow', () => {
    const view = statusPageView([], inopSys(16), 0);
    expect(STATUS_PAGE_ROWS).toBe(17);
    expect(rows(view.right)).toHaveLength(17);
    expect(view).toMatchObject({ pageIndex: 0, pageCount: 1, overflow: false });
  });

  it('a 17th system overflows: the arrow on page 1, the rest of the list on page 2', () => {
    const page1 = statusPageView([], inopSys(17), 0);
    expect(page1).toMatchObject({ pageCount: 2, overflow: true });
    expect(rows(page1.right)[0]).toContain('INOP SYS');
    expect(rows(page1.right)).toHaveLength(17);

    const page2 = statusPageView([], inopSys(17), 1);
    expect(page2).toMatchObject({ pageIndex: 1, pageCount: 2, overflow: false });
    // the continuation: the 17th system only (amber), no title again
    expect(rows(page2.right)).toEqual(['\x1b<4mAPU LOOP A']);
  });

  it('shows all 35 INOP SYS of DC BUS 1+2 over three pages, every system once', () => {
    const codes = inopSys(35);
    expect(statusPageCount([], codes)).toBe(3);
    const shown = [0, 1, 2].flatMap((page) => rows(statusPageView([], codes, page).right));
    // the title and the 35 systems
    expect(shown).toHaveLength(36);
    expect(new Set(shown).size).toBe(36);
    expect(statusPageView([], codes, 1).overflow).toBe(true);
    expect(statusPageView([], codes, 2).overflow).toBe(false);
  });

  it('pages both columns together: the longer one gives the page count', () => {
    const view = statusPageView(INFORMATION, inopSys(20), 1);
    expect(view.pageCount).toBe(2);
    // the left column has ended: its page 2 is empty
    expect(view.left).toBe('');
    expect(rows(view.right)).toHaveLength(4);
  });

  it('limits the page asked to the last page, and NORMAL is one page', () => {
    expect(statusPageView([], inopSys(5), 3).pageIndex).toBe(0);
    expect(statusPageView([], [], 0)).toMatchObject({ normal: true, pageCount: 1, overflow: false });
    expect(statusPageView([], [], 0).left).toContain('NORMAL');
  });
});
