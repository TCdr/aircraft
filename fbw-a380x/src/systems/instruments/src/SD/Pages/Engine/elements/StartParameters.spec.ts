// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  StartValveFault,
  nacelleTemperatureVisible,
  startParametersVisible,
  startValveColour,
} from './StartParameters';

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

/* A380 FCOM DSC-70-90 START VALVE (a380_fcom.txt l.113452-113462): amber when abnormally open or closed. */
describe('SD ENGINE start valve colour', () => {
  it('is green without start valve fault', () => {
    expect(startValveColour(StartValveFault.None)).toBe('Green');
  });

  it('is amber when the valve is abnormally closed (VLV STUCK CLOSED) or open (START VLV NOT CLOSED)', () => {
    expect(startValveColour(StartValveFault.NotOpen)).toBe('Amber');
    expect(startValveColour(StartValveFault.NotClosed)).toBe('Amber');
  });

  it('keeps the FADEC values of systems::engine::engine_start::StartValveFault', () => {
    expect([StartValveFault.None, StartValveFault.NotOpen, StartValveFault.NotClosed]).toEqual([0, 1, 2]);
  });

  it('shows the start parameters, not the nacelle temperature, while a start valve fault is reported at NORM', () => {
    // a valve stuck open after the start: selector back at NORM, no igniter, valve open
    expect(startParametersVisible(false, false, false, false, true)).toBe(true);
    expect(nacelleTemperatureVisible(true, false, false, false, true)).toBe(false);
    // a valve stuck closed reported after the start was stopped: valve closed
    expect(nacelleTemperatureVisible(false, false, false, false, true)).toBe(false);
  });

  it('colours the valve symbol from the fault the FADEC reports', () => {
    const startValve = readFileSync(resolve(__dirname, 'StartValve.tsx'), 'utf-8');
    expect(startValve).not.toContain('css="Green SW2"');
    expect(startValve).toContain('startValveColour(startValveFault)');
    const column = readFileSync(resolve(__dirname, 'EngineColumn.tsx'), 'utf-8');
    expect(column).toContain('_START_VALVE_FAULT`');
  });
});
