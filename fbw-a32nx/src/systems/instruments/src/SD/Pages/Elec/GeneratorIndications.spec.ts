// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isEngineGeneratorLegendAmber, isEngineGeneratorNumberAmber } from './GeneratorIndications';

/* ELEC page GEN 1(2) */
describe('SD ELEC GEN 1(2) colours', () => {
  it('shows the number white with the GEN pb OFF and the engine running', () => {
    expect(isEngineGeneratorNumberAmber(false, true, false)).toBe(false);
  });

  it('shows the number amber with the GEN pb OFF and the engine not running', () => {
    expect(isEngineGeneratorNumberAmber(false, false, false)).toBe(true);
  });

  it('shows GEN amber with the GEN pb OFF', () => {
    expect(isEngineGeneratorLegendAmber(false, false)).toBe(true);
    expect(isEngineGeneratorLegendAmber(false, true)).toBe(true);
  });

  it('shows GEN and the number amber with the GEN pb ON only on an abnormal parameter', () => {
    expect(isEngineGeneratorLegendAmber(true, true)).toBe(false);
    expect(isEngineGeneratorNumberAmber(true, true, true)).toBe(false);
    expect(isEngineGeneratorLegendAmber(true, false)).toBe(true);
    expect(isEngineGeneratorNumberAmber(true, true, false)).toBe(true);
  });
});
