// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320_BUFFET_ENVELOPE as A320, evaluateBuffet } from './buffet';
import { BuffetLiveReadings, buffetBanner, isBuffetTurn, liveBuffetInputs } from './buffetLive';

const cruise: BuffetLiveReadings = {
  fmsGrossWeight: 68.4,
  airframeGrossWeight: 68_900,
  cg: 29.6,
  adrAltitude: { value: 37_000, normal: true },
  simPressureAltitude: 37_020,
  adrMach: { value: 0.78, normal: true },
  simMach: 0.781,
  irRoll: { value: -12, normal: true },
  simBank: 11,
};

describe('Buffet page live inputs', () => {
  it('reads the FMS gross weight, ADR 1 and IR 1 (bank either side)', () => {
    const inputs = liveBuffetInputs(cruise);
    expect(inputs.weightTonnes).toBe(68.4);
    expect(inputs.pressureAltitude).toBe(37_000);
    expect(inputs.mach).toBe(0.78);
    expect(inputs.bank).toBe(12);
    expect(inputs.sources).toEqual({ weight: 'FMS GW', cg: 'W&B', altitude: 'ADR 1', mach: 'ADR 1', bank: 'IR 1' });
  });

  it('falls back to the weight and balance and the sim values', () => {
    const inputs = liveBuffetInputs({
      ...cruise,
      fmsGrossWeight: 0,
      adrAltitude: { value: 0, normal: false },
      adrMach: { value: 0, normal: false },
      irRoll: { value: 0, normal: false },
    });
    expect(inputs.weightTonnes).toBeCloseTo(68.9, 9);
    expect(inputs.pressureAltitude).toBe(37_020);
    expect(inputs.mach).toBe(0.781);
    expect(inputs.bank).toBe(11);
    expect(inputs.sources).toEqual({ weight: 'W&B', cg: 'W&B', altitude: 'SIM', mach: 'SIM', bank: 'SIM' });
  });
});

describe('Buffet page banner', () => {
  const banner = (weightTonnes: number, cg: number, pressureAltitude: number, mach: number, bank: number) => {
    const inputs = { weightTonnes, cg, pressureAltitude, mach, bank };
    return buffetBanner(inputs, evaluateBuffet(A320, inputs));
  };

  it('shows the turn from 3 deg of bank', () => {
    expect(isBuffetTurn(2.9)).toBe(false);
    expect(isBuffetTurn(-3)).toBe(true);
  });

  it('has no banner in the cruise case', () => {
    expect(banner(68.4, 29.6, 37_000, 0.78, 0)).toBe('none');
  });

  it('is amber under 0.3 g and red under 0.2 g of level margin', () => {
    // 72 t, CG 25 %, FL380, M .78: n_buffet 1.26 g; 76 t FL390: 1.13 g
    expect(banner(72, 25, 38_000, 0.78, 0)).toBe('belowCaution');
    expect(banner(76, 24, 39_000, 0.78, 0)).toBe('belowWarning');
  });

  it('is the turn banner when the bank needs more than the buffet onset', () => {
    expect(banner(76, 24, 39_000, 0.76, 30)).toBe('turn');
  });

  it('says when there is no weight or the Mach is outside the chart', () => {
    expect(banner(0, 25, 37_000, 0.78, 0)).toBe('noWeight');
    expect(banner(60, 25, 0, 0, 0)).toBe('outsideChart');
  });
});
