// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { formatStatusPage, orderStatusCodes } from './StatusMessages';

/**
 * The message codes written more than once in a message table source file. The tables are Maps built from
 * `['code', {...}]` entries (StatusMessages) or object literals with `'code': '...'` keys (EwdMessages): a second entry
 * with the same code silently replaces the text of the first one, so the source text is checked, not the built table.
 */
function duplicatedCodes(fileName: string): string[] {
  const source = readFileSync(resolve(__dirname, fileName), 'utf-8');
  const codePattern = /^\s*(?:\[\s*'(\d{9})'\s*,|'(\d{9})'\s*:)/gm;
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = codePattern.exec(source)) !== null) {
    const code = match[1] ?? match[2];
    if (seen.has(code)) {
      duplicated.add(code);
    }
    seen.add(code);
  }
  return Array.from(duplicated);
}

describe('A320 ECAM message tables', () => {
  it('give each STATUS code one line only', () => {
    expect(duplicatedCodes('StatusMessages.ts')).toEqual([]);
  });

  it('give each E/WD code one line only', () => {
    expect(duplicatedCodes('EwdMessages.ts')).toEqual([]);
  });
});

const GPS_1 = '340300001';
const GPS_1_AND_2 = '340300003';
const FLS_LIMITED = '340200001';

describe('A320 ECAM STATUS page texts (FCOM DSC-31-20)', () => {
  it('shows NORMAL when the page is empty', () => {
    const page = formatStatusPage([], []);
    expect(page.normal).toBe(true);
    expect(page.left).toContain('\x1b<3mNORMAL');
    expect(page.right).toBe('');
  });

  it('lists the inoperative systems in amber under the INOP SYS title, white and underlined', () => {
    const page = formatStatusPage([], [GPS_1]);
    expect(page.normal).toBe(false);
    expect(page.right).toBe('\x1b<7m\x1b4mINOP SYS\x1bm\r\x1b<4mGPS 1');
    expect(page.left).toBe('');
  });

  it('shows the information lines in green on the left', () => {
    const page = formatStatusPage([FLS_LIMITED], [GPS_1_AND_2]);
    expect(page.left).toBe('\x1b<3mFLS LIMITED TO F-APP + RAW');
    expect(page.right).toContain('GPS 1+2');
  });

  it('ignores unknown codes', () => {
    expect(formatStatusPage(['999999999'], ['999999998']).normal).toBe(true);
  });

  it('orders the codes and removes the duplicates', () => {
    expect(orderStatusCodes([GPS_1_AND_2, GPS_1, GPS_1_AND_2])).toEqual([GPS_1, GPS_1_AND_2]);
  });

  it('shows a line that two alerts give with different codes once, at its first place', () => {
    const ENG_SHUT_DOWN_LDG_DIST_PROC = '700400004';
    const HYD_LDG_DIST_PROC = '290400017';
    const HYD_CAT_3_DUAL = '290300030';
    const FWC_CAT_3_DUAL = '220300001';
    expect(orderStatusCodes([HYD_LDG_DIST_PROC])).toEqual([HYD_LDG_DIST_PROC]);
    expect(orderStatusCodes([HYD_CAT_3_DUAL])).toEqual([HYD_CAT_3_DUAL]);
    expect(orderStatusCodes([HYD_LDG_DIST_PROC, ENG_SHUT_DOWN_LDG_DIST_PROC])).toHaveLength(1);
    const page = formatStatusPage([HYD_LDG_DIST_PROC, ENG_SHUT_DOWN_LDG_DIST_PROC], [HYD_CAT_3_DUAL, FWC_CAT_3_DUAL]);
    expect(page.left).toBe('\x1b<5mLDG DIST PROC....APPLY');
    expect(page.right).toBe('\x1b<7m\x1b4mINOP SYS\x1bm\r\x1b<4mCAT 3 DUAL');
  });
});
