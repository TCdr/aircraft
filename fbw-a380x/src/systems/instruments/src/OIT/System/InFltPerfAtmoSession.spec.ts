// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { InFltPerfAtmoSession, NO_ATMO_RESULTS, atmoMode, hasAtmoResults } from './InFltPerfAtmoSession';

const ENTRIES = [
  'computationType',
  'speedType',
  'altType',
  'wind',
  'course',
  'temperature',
  'grossWeight',
  'mach',
  'ias',
  'indicatedAltitude',
  'airportElevation',
  'heightAal',
  'airportTemperature',
  'results',
] as const;

describe('IN-FLT PERF ATMO session', () => {
  it('keeps the entries and results of the page in the laptop session', () => {
    // The switching bar draws the page again: an entry held by the page itself would be lost
    const page = readFileSync(resolve(__dirname, '../Pages/FltOps/OitFltOpsInFltPerf.tsx'), 'utf-8');
    for (const entry of ENTRIES) {
      expect(page, entry).toContain(`private readonly ${entry} = this.session.${entry};`);
    }
  });

  it('clears the entries and results with CLEAR, the computation types stay', () => {
    const session = new InFltPerfAtmoSession();
    session.computationType.set(1);
    session.altType.set(1);
    session.mach.set(0.85);
    session.indicatedAltitude.set(35_000);
    session.wind.set({ headwindKt: 10 });
    session.results.set({ kind: 'errors', lines: ['X'] });
    session.clearEntries();
    expect(session.computationType.get()).toBe(1);
    expect(session.altType.get()).toBe(1);
    expect(session.mach.get()).toBe(null);
    expect(session.indicatedAltitude.get()).toBe(null);
    expect(session.wind.get()).toBe(null);
    expect(session.results.get()).toBe(NO_ATMO_RESULTS);
  });

  it('starts as on the first opening after EXIT SESSION', () => {
    const session = new InFltPerfAtmoSession();
    session.computationType.set(1);
    session.speedType.set(1);
    session.ias.set(250);
    session.reset();
    expect(session.computationType.get()).toBe(0);
    expect(session.speedType.get()).toBe(0);
    expect(session.ias.get()).toBe(null);
  });
});

describe('IN-FLT PERF ATMO page vocabulary', () => {
  it('knows the computation of the page from its types', () => {
    expect(atmoMode(0, 1)).toBe('SPEED');
    expect(atmoMode(null, null)).toBe('SPEED');
    expect(atmoMode(1, 0)).toBe('TRUE ALT');
    expect(atmoMode(1, 1)).toBe('LO ALT');
  });

  it('has results only after a computation, not for the missing parameters', () => {
    expect(hasAtmoResults(NO_ATMO_RESULTS)).toBe(false);
    expect(hasAtmoResults({ kind: 'errors', lines: ['MACH'] })).toBe(false);
    expect(hasAtmoResults({ kind: 'lo alt', results: { correctionFt: 1, correctedHeightAalFt: 2 } })).toBe(true);
  });
});
