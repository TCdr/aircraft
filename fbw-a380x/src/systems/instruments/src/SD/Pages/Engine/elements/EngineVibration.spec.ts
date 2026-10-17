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

  // The red cross appears with the exceedance and goes after a subsequent engine start on the ground
  it('shows the N3 red cross above 118.7 % and keeps it once the N3 is back below the limit', () => {
    expect(n3RedCrossShown(false, 118.7, false, true)).toBe(false);
    expect(n3RedCrossShown(false, 118.8, false, true)).toBe(true);
    expect(n3RedCrossShown(true, 95, false, true)).toBe(true);
  });

  // a380_fcom.txt l.73512-73516: "If a parameter value on any SD page is not available for display, XX appears"
  it('latches no N3 red cross on an N3 the FADEC does not send (XX) or that is not a finite number', () => {
    expect(n3RedCrossShown(false, 125, false, false)).toBe(false);
    expect(n3RedCrossShown(false, Infinity, false, true)).toBe(false);
    expect(n3RedCrossShown(false, NaN, false, true)).toBe(false);
    // a cross latched while the data was valid stays while the data is lost
    expect(n3RedCrossShown(true, 0, false, false)).toBe(true);
  });

  it('removes the N3 red cross at the next engine start on the ground only', () => {
    expect(n3RedCrossShown(true, 20, true, true)).toBe(false);
    expect(n3RedCrossShown(true, 119, true, true)).toBe(true);
  });

  it('draws the red cross next to the N3 value', () => {
    const column = readFileSync(resolve(__dirname, 'EngineColumn.tsx'), 'utf-8');
    expect(column).toContain('n3RedCrossShown(shownBefore, N3, groundStart, fadecPowered)');
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
