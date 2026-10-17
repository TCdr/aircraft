// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { shouldProtectDetectedRunway } from './RowProtectedRunway';

describe('A380X ROW protected runway', () => {
  it('basic auto-brake or pedal braking: the detected runway is protected from 500 ft', () => {
    expect(shouldProtectDetectedRunway(480, false, 'EDDF25C', 'EDDF25L')).toBe(true);
    expect(shouldProtectDetectedRunway(400, false, null, 'EDDF25L')).toBe(true);
  });

  it('BTV: the selected runway stays protected between 500 ft and 300 ft', () => {
    expect(shouldProtectDetectedRunway(480, true, 'EDDF25C', 'EDDF25L')).toBe(false);
    expect(shouldProtectDetectedRunway(340, true, 'EDDF25C', 'EDDF25L')).toBe(false);
  });

  it('BTV: the detection "is performed only at 300 ft"', () => {
    expect(shouldProtectDetectedRunway(305, true, 'EDDF25C', 'EDDF25L')).toBe(true);
  });

  it('BTV without a selected runway: the detected runway is protected', () => {
    expect(shouldProtectDetectedRunway(480, true, null, 'EDDF25L')).toBe(true);
  });

  it('the same runway is not set again', () => {
    expect(shouldProtectDetectedRunway(305, false, 'EDDF25L', 'EDDF25L')).toBe(false);
  });

  it('BrakeToVacate uses this rule (no 350 ft BTV priority in every mode)', () => {
    const btv = readFileSync(resolve(__dirname, './BrakeToVacate.ts'), 'utf-8');
    expect(btv).toContain('shouldProtectDetectedRunway(');
    expect(btv).not.toContain('this.radioAltitude.get() < 350');
  });
});
