// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { n3ClassName, vibrationClassName } from './EngineVibration';

describe('A380X SD ENGINE page vibrations and N3', () => {
  it('pulses a vibration above 5 units', () => {
    expect(vibrationClassName(5)).toBe('Green');
    expect(vibrationClassName(5.1)).toBe('FillPulse');
  });

  it('shows the N3 red above 118.7 %', () => {
    expect(n3ClassName(118.7)).toBe('Green');
    expect(n3ClassName(118.8)).toBe('Red');
  });

  it('reads separate N1, N2 and N3 vibrations from the systems WASM', () => {
    const column = readFileSync(resolve(__dirname, 'EngineColumn.tsx'), 'utf-8');
    expect(column).not.toContain('TURB ENG VIBRATION');
    expect(column).toContain('_N1_VIBRATION`');
    expect(column).toContain('_N2_VIBRATION`');
    expect(column).toContain('_N3_VIBRATION`');
  });
});
