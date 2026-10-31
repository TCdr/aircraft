// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { withRenderedEngineColumn } from '../EngineColumnSpecSupport';
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

  // A parameter value that is not available for display shows XX on any SD page
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
    const redCrossShown = (n3: number) =>
      withRenderedEngineColumn({ 'L:A32NX_ENGINE_N3:1': n3 }, (container) =>
        Array.from(container.querySelectorAll('text')).some(
          (text) => text.textContent === '+' && text.getAttribute('class') === 'Red F25 MiddleAlign',
        ),
      );
    expect(redCrossShown(118.7)).toBe(false);
    expect(redCrossShown(118.8)).toBe(true);
  });

  it('reads separate N1, N2 and N3 vibrations from the systems WASM', () => {
    const vibrationValues = withRenderedEngineColumn(
      {
        'L:A32NX_ENGINE_1_N1_VIBRATION': 1.1,
        'L:A32NX_ENGINE_1_N2_VIBRATION': 2.2,
        'L:A32NX_ENGINE_1_N3_VIBRATION': 3.3,
        // the sim's own single vibration value must not be shown
        'TURB ENG VIBRATION:1': 4.4,
      },
      (container) =>
        Array.from(container.querySelectorAll('text'))
          .map((text) => text.textContent)
          .filter((content) => /^\d\.\d$/.test(content ?? '')),
    );
    expect(vibrationValues).toContain('1.1');
    expect(vibrationValues).toContain('2.2');
    expect(vibrationValues).toContain('3.3');
    expect(vibrationValues).not.toContain('4.4');
  });
});
