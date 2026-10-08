// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { nacelleTemperatureVisible, startParametersVisible } from './StartParameters';

/* A380 FCOM DSC-70-90 START PARAMETERS: the start indications replace the nacelle temperature indications. */
describe('SD ENGINE start parameters or nacelle temperature', () => {
  it('shows the start parameters during a start and with the selector at IGN START, as before', () => {
    expect(startParametersVisible(true, true, false, false)).toBe(true);
    expect(startParametersVisible(false, true, false, false)).toBe(true);
    expect(nacelleTemperatureVisible(false, true, false, false)).toBe(false);
  });

  it('shows the nacelle temperature with the selector at NORM and no igniter energized', () => {
    expect(startParametersVisible(false, false, false, false)).toBe(false);
    expect(nacelleTemperatureVisible(false, false, false, false)).toBe(true);
  });

  it('shows the start parameters (A B) while the FADEC energizes the igniters at NORM: auto relight', () => {
    expect(startParametersVisible(false, false, true, true)).toBe(true);
    expect(nacelleTemperatureVisible(false, false, true, true)).toBe(false);
  });

  it('never shows both blocks', () => {
    for (const starterValveOpen of [false, true]) {
      for (const ign of [false, true]) {
        for (const a of [false, true]) {
          for (const b of [false, true]) {
            const starting = starterValveOpen && ign;
            expect(
              startParametersVisible(starting, ign, a, b) && nacelleTemperatureVisible(starterValveOpen, ign, a, b),
            ).toBe(false);
          }
        }
      }
    }
  });
});
