// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { formatStatusPage, orderStatusCodes } from './StatusMessages';

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
});
