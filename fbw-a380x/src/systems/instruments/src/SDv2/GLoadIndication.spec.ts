// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { GLoadIndication } from './GLoadIndication';

/**
 * Runs the indication for a duration in 100 ms steps.
 * @param indication the indication under test
 * @param ms the duration, in ms
 * @param phase the FWS flight phase
 * @param gLoad the normal acceleration in g, null when invalid
 * @returns the last state of the indication
 */
const run = (indication: GLoadIndication, ms: number, phase: number, gLoad: number | null) => {
  let shown = false;
  for (let t = 0; t < ms; t += 100) {
    shown = indication.update(100, phase, gLoad);
  }
  return shown;
};

/*
 * A380 FCOM DSC-31-40-10 G LOAD DATA: airborne, G LOAD < 0.7 g or > 1.4 g for longer than 2 s; it remains visible
 * 5 s after the G load returns to normal.
 */
describe('SD G LOAD indication', () => {
  it('is not shown on the ground', () => {
    expect(run(new GLoadIndication(), 5_000, 2, 1.6)).toBe(false);
  });

  it('is shown in flight only after more than 2 s', () => {
    const indication = new GLoadIndication();
    expect(run(indication, 1_500, 8, 1.6)).toBe(false);
    expect(run(indication, 1_000, 8, 1.6)).toBe(true);
  });

  it('a short excursion does not show it', () => {
    const indication = new GLoadIndication();
    run(indication, 1_500, 8, 0.5);
    run(indication, 100, 8, 1.0);
    expect(run(indication, 1_500, 8, 0.5)).toBe(false);
  });

  it('stays 5 s after the G load returns to normal', () => {
    const indication = new GLoadIndication();
    run(indication, 3_000, 7, 1.6);
    expect(run(indication, 4_500, 7, 1.0)).toBe(true);
    expect(run(indication, 600, 7, 1.0)).toBe(false);
  });

  it('the SD status area uses the logic, not the raw 0.7-1.4 g test', () => {
    const area = readFileSync(resolve(__dirname, 'StatusArea.tsx'), 'utf-8');
    expect(area).toContain('this.gLoadIndication.update(');
    expect(area).not.toContain('// FIXME');
  });
});
