// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { n3ClassName, n3RedCrossShown, vibrationClassName } from './EngineVibration';

describe('A380X SD ENGINE page vibrations and N3', () => {
  it('pulses a vibration above 5 units', () => {
    expect(vibrationClassName(5)).toBe('Green');
    expect(vibrationClassName(5.1)).toBe('FillPulse');
  });

  it('shows the N3 red above 118.7 %', () => {
    expect(n3ClassName(118.7)).toBe('Green');
    expect(n3ClassName(118.8)).toBe('Red');
  });

  // FCOM DSC-70-90 N2 (l.113300-113302): red cross with the exceedance, gone after a subsequent engine start on ground
  it('shows the N3 red cross above 118.7 % and keeps it once the N3 is back below the limit', () => {
    expect(n3RedCrossShown(false, 118.7, false)).toBe(false);
    expect(n3RedCrossShown(false, 118.8, false)).toBe(true);
    expect(n3RedCrossShown(true, 95, false)).toBe(true);
  });

  it('removes the N3 red cross at the next engine start on the ground only', () => {
    expect(n3RedCrossShown(true, 20, true)).toBe(false);
    expect(n3RedCrossShown(true, 119, true)).toBe(true);
  });

  it('draws the red cross next to the N3 value', () => {
    const column = readFileSync(resolve(__dirname, 'EngineColumn.tsx'), 'utf-8');
    expect(column).toContain('n3RedCrossShown(shownBefore, N3, groundStart)');
    expect(column).toMatch(/n3RedCross && \(\s*<text[^>]*className="Red F25 MiddleAlign">\s*\+\s*<\/text>/);
  });

  it('reads separate N1, N2 and N3 vibrations from the systems WASM', () => {
    const column = readFileSync(resolve(__dirname, 'EngineColumn.tsx'), 'utf-8');
    expect(column).not.toContain('TURB ENG VIBRATION');
    expect(column).toContain('_N1_VIBRATION`');
    expect(column).toContain('_N2_VIBRATION`');
    expect(column).toContain('_N3_VIBRATION`');
  });
});
