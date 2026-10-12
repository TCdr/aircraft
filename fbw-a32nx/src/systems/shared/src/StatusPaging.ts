// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { formatStatusPage } from './StatusMessages';

/*
 * The pages of the A320 ECAM STATUS page (FCOM DSC-31-20 STATUS PAGE, a320_fcom.txt l.46196-46199): "(8) The arrow
 * appears if the data on the STATUS page overflows the left or right area of the page. The flight crew can press the
 * CLR pb, in order to scroll the display to view the overflow."
 *
 * The FWC sends all its STATUS codes (L:A32NX_ECAM_STATUS_LEFT/RIGHT_LINE_n) and the page shown
 * (L:A32NX_ECAM_STATUS_PAGE_INDEX). The SD formats the codes into display rows (formatStatusPage: colours, titles,
 * blank lines) and shows the rows of that page; the FWC counts the pages with the same function.
 */

/** How many codes the FWC sends per column at most (L:A32NX_ECAM_STATUS_{side}_LINE_1 to _64) */
export const STATUS_COLUMN_CODES = 64;

/**
 * How many display rows one STATUS page has per column (design choice from the SD layout): the rows are 30 px apart
 * from y = 118 (FormattedFwcText), so 17 rows end at y = 598, where the column separator ends (y = 593); the overflow
 * arrow goes below it, above the permanent data (y = 667), as the arrow (8) of the FCOM figure. Page 1 holds the INOP
 * SYS title and 16 systems, the 16 codes of the former single page.
 */
export const STATUS_PAGE_ROWS = 17;

/** The page of the STATUS page shown on the SD, from 0, written by the FWC */
export const STATUS_PAGE_INDEX_VAR = 'L:A32NX_ECAM_STATUS_PAGE_INDEX';

/**
 * Written by the FWC: the STATUS page shown on the SD has a next page and the next CLR push shows it (two ECAM displays,
 * no alert on the E/WD). The DMC does not remove the STATUS page on that push.
 */
export const STATUS_CLR_SCROLLS_VAR = 'L:A32NX_ECAM_STATUS_CLR_SCROLLS';

/** The L:var of one STATUS code of a column, line from 1 */
export function statusLineVar(side: 'LEFT' | 'RIGHT', line: number): string {
  return `L:A32NX_ECAM_STATUS_${side}_LINE_${line}`;
}

/**
 * The codes of one column as the SD reads them, up to the first empty line: the FWC sends the codes from line 1 on,
 * without gaps.
 * @param side the column
 * @param read reads one L:var as a number (0 for an empty line)
 */
export function readStatusColumnCodes(side: 'LEFT' | 'RIGHT', read: (name: string) => number): string[] {
  const codes: string[] = [];
  for (let line = 1; line <= STATUS_COLUMN_CODES; line++) {
    const code = read(statusLineVar(side, line));
    if (!code) {
      break;
    }
    codes.push(code.toString().padStart(9, '0'));
  }
  return codes;
}

export interface StatusPageView {
  /** Whether the STATUS page is empty: NORMAL is shown */
  normal: boolean;
  /** The rows of the shown page, left column, separated by \r */
  left: string;
  /** The rows of the shown page, right column, separated by \r */
  right: string;
  /** The page shown, from 0 (the asked page, limited to the last page) */
  pageIndex: number;
  /** How many pages the STATUS has, 1 at least */
  pageCount: number;
  /** Whether the green arrow is shown: more rows follow on a next page, in either column */
  overflow: boolean;
}

function rows(text: string): string[] {
  return text === '' ? [] : text.split('\r');
}

/**
 * One page of the STATUS page. Design choices: both columns scroll together (one arrow, the CLR pb "scroll[s] the
 * display", FCOM l.46199); a page shows the next STATUS_PAGE_ROWS rows of each column, titles are not repeated.
 * @param leftCodes the codes of the left column, as sent by the FWC
 * @param rightCodes the codes of the right column (INOP SYS), as sent by the FWC
 * @param pageIndex the page asked, from 0
 */
export function statusPageView(
  leftCodes: readonly string[],
  rightCodes: readonly string[],
  pageIndex: number,
): StatusPageView {
  const texts = formatStatusPage(leftCodes, rightCodes);
  const leftRows = rows(texts.left);
  const rightRows = rows(texts.right);
  const pageCount = Math.max(1, Math.ceil(Math.max(leftRows.length, rightRows.length) / STATUS_PAGE_ROWS));
  const index = Math.min(Math.max(0, Math.floor(pageIndex)), pageCount - 1);
  const first = index * STATUS_PAGE_ROWS;
  return {
    normal: texts.normal,
    left: leftRows.slice(first, first + STATUS_PAGE_ROWS).join('\r'),
    right: rightRows.slice(first, first + STATUS_PAGE_ROWS).join('\r'),
    pageIndex: index,
    pageCount,
    overflow: index < pageCount - 1,
  };
}

/** How many pages the STATUS page has for these codes, 1 at least */
export function statusPageCount(leftCodes: readonly string[], rightCodes: readonly string[]): number {
  return statusPageView(leftCodes, rightCodes, 0).pageCount;
}
