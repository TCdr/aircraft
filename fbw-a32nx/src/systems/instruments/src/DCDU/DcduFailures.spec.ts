// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { dcduKeyEvent, dcduKeyWorks } from './DcduFailures';

/* The DCDU 1 and DCDU 2 flyPad failures (FCOM DSC-46-10-10, a320_fcom.txt l.59032) */
describe('DCDU failures', () => {
  const noFailure = { dcdu1Failed: false, dcdu2Failed: false };

  it('the keys of a failed DCDU do nothing, the other DCDU keeps working', () => {
    expect(dcduKeyWorks('MPL', noFailure)).toBe(true);
    expect(dcduKeyWorks('MPR', noFailure)).toBe(true);
    expect(dcduKeyWorks('MPL', { ...noFailure, dcdu1Failed: true })).toBe(false);
    expect(dcduKeyWorks('MPR', { ...noFailure, dcdu1Failed: true })).toBe(true);
    expect(dcduKeyWorks('MPL', { ...noFailure, dcdu2Failed: true })).toBe(true);
    expect(dcduKeyWorks('MPR', { ...noFailure, dcdu2Failed: true })).toBe(false);
  });

  it('names the key events of the cockpit model', () => {
    expect(dcduKeyEvent('MPL', 'PRINT')).toBe('A32NX_DCDU_BTN_MPL_PRINT');
    expect(dcduKeyEvent('MPR', 'L1')).toBe('A32NX_DCDU_BTN_MPR_L1');
  });

  it('every DCDU key goes through the failure check, and the ATSU off shows INVALID DATA', () => {
    const read = (file: string) => readFileSync(resolve(__dirname, file), 'utf-8');
    for (const file of ['index.tsx', 'elements/Button.tsx', 'elements/MessageVisualization.tsx']) {
      expect(read(file)).not.toContain('A32NX_DCDU_BTN_');
      expect(read(file)).toContain('useDcduKeyEvent(');
    }
    expect(read('index.tsx')).toContain('return <InvalidData />;');
    expect(read('pages/InvalidData.tsx')).toContain('INVALID DATA');
  });
});
