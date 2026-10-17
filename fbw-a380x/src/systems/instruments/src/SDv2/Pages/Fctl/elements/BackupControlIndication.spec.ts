// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isBackupControlActive } from './BackupControlIndication';

describe('SD F/CTL BKUP CTL ACTIVE', () => {
  it('is shown when all the PRIMs and SECs are lost', () => {
    expect(isBackupControlActive([false, false, false], [false, false, false])).toBe(true);
    expect(isBackupControlActive([0, 0, 0], [0, 0, 0])).toBe(true);
  });

  it('is not shown while one PRIM or one SEC is healthy (SimVar Bool reads give 1)', () => {
    expect(isBackupControlActive([0, 0, 1], [0, 0, 0])).toBe(false);
    expect(isBackupControlActive([0, 0, 0], [0, 1, 0])).toBe(false);
    expect(isBackupControlActive([true, true, true], [true, true, true])).toBe(false);
  });

  it('the F/CTL page draws the indication', () => {
    const page = readFileSync(resolve(__dirname, '../FctlPage.tsx'), 'utf8');
    expect(page).toMatch(/<BackupControlActive x=\{\d+\} y=\{\d+\} bus=\{this\.props\.bus\} \/>/);
    const element = readFileSync(resolve(__dirname, 'ComputerIndication.tsx'), 'utf8');
    expect(element).toContain('isBackupControlActive(');
  });
});
