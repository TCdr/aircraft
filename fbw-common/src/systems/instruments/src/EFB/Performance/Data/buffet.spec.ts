// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  A320_BUFFET_ENVELOPE as A320,
  buffetAlert,
  buffetBoundary,
  buffetCeiling,
  buffetCgFactor,
  buffetLift,
  buffetMachRange,
  buffetOnsetLoadFactor,
  casToMach,
  evaluateBuffet,
  loadFactorForBank,
  maxBankBeforeBuffet,
  maxOperatingMach,
} from './buffet';

describe('A320 buffet onset: the FCOM LIM-13 BUFFET ONSET worked examples', () => {
  it('example 1: M .55, FL350, CG 31 %, 50 t gives about 1.25 g or 35 deg of bank', () => {
    // The chart reading of the example is "1.25 g or 35° bank"; 1 / cos 35° = 1.22 (the 1.25 is chart rounding)
    const n = buffetOnsetLoadFactor(A320, 0.55, 35_000, 31, 50);
    expect(n).not.toBeNull();
    expect(n).toBeGreaterThan(1.2);
    expect(n).toBeLessThan(1.25);
    expect(maxBankBeforeBuffet(n)).toBeCloseTo(35, 0);
  });

  it('example 2: 1.7 g, 60 t, CG 31 %, FL350 gives M .73 (low speed buffet) and M .81 (high speed buffet)', () => {
    const range = buffetMachRange(A320, 1.7, 35_000, 31, 60);
    expect(range).not.toBeNull();
    expect(Math.abs(range.low - 0.73)).toBeLessThan(0.015);
    expect(Math.abs(range.high - 0.81)).toBeLessThan(0.005);
  });
});

describe('A320 buffet onset: the QRH PER-M-2 M.78 buffet lines (CG 33 % MAC)', () => {
  // [load factor, weight t, flight level] read off the QRH n = 1.3 g and n = 1.4 g lines
  const qrhPoints: [number, number, number][] = [
    [1.3, 70, 388],
    [1.3, 76, 370],
    [1.4, 66, 384],
    [1.4, 74, 361],
  ];

  it.each(qrhPoints)('n = %d g at %d t is reached at FL%d within 1.5 %%', (n, weight, fl) => {
    const model = buffetOnsetLoadFactor(A320, 0.78, fl * 100, 33, weight);
    expect(Math.abs(model / n - 1)).toBeLessThan(0.015);
  });

  it.each(qrhPoints)('the n = %d g ceiling at %d t is FL%d within 500 ft', (n, weight, fl) => {
    expect(Math.abs(buffetCeiling(A320, n, 0.78, 33, weight) - fl * 100)).toBeLessThan(500);
  });
});

describe('A320 buffet onset: the CG correction of the chart', () => {
  it('is 1 at the 25 % MAC reference line and 0.245 % per % MAC', () => {
    expect(buffetCgFactor(A320, 25)).toBe(1);
    expect(buffetCgFactor(A320, 31)).toBeCloseTo(1.0147, 4);
    expect(buffetCgFactor(A320, 20)).toBeCloseTo(0.98775, 5);
  });

  it('raises the buffet onset load factor with an aft CG', () => {
    const forward = buffetOnsetLoadFactor(A320, 0.78, 37_000, 25, 65);
    const aft = buffetOnsetLoadFactor(A320, 0.78, 37_000, 35, 65);
    expect(aft / forward).toBeCloseTo(1.0245, 4);
  });
});

describe('A320 buffet onset: the Mach range of the chart (M .50 to .82)', () => {
  it('has the table ends of the chart', () => {
    expect(buffetLift(A320, 0.5)).toBe(220);
    expect(buffetLift(A320, 0.78)).toBe(449.4);
    expect(buffetLift(A320, 0.82)).toBe(403);
    expect(buffetLift(A320, 0.775)).toBeCloseTo(448.7, 6);
  });

  it('gives nothing below M .50 or above M .82', () => {
    expect(buffetLift(A320, 0.49)).toBeNull();
    expect(buffetLift(A320, 0.83)).toBeNull();
    expect(buffetOnsetLoadFactor(A320, 0.3, 10_000, 30, 60)).toBeNull();
    expect(buffetOnsetLoadFactor(A320, 0.85, 35_000, 30, 60)).toBeNull();
    expect(buffetCeiling(A320, 1.3, 0.45, 30, 60)).toBeNull();
    expect(evaluateBuffet(A320, { weightTonnes: 60, cg: 30, pressureAltitude: 0, mach: 0, bank: 0 })).toBeNull();
  });

  it('has no low-speed edge when the load factor is reached below M .50', () => {
    const range = buffetMachRange(A320, 1.3, 20_000, 30, 50);
    expect(range).toEqual({ low: null, high: null });
  });

  it('draws no boundary point below M .50 or beyond the maximum operating Mach', () => {
    const boundary = buffetBoundary(A320, 1.0, 29.6, 68.4, 200, 450);
    expect(boundary.lowSpeed.length).toBeGreaterThan(0);
    expect(boundary.highSpeed.length).toBeGreaterThan(0);
    for (const [mach, fl] of [...boundary.lowSpeed, ...boundary.highSpeed]) {
      expect(mach).toBeGreaterThanOrEqual(0.5);
      expect(mach).toBeLessThanOrEqual(maxOperatingMach(A320, fl * 100) + 1e-9);
    }
  });

  it('has VMO 350 kt below the crossover near FL246 and MMO .82 above', () => {
    expect(casToMach(350, 24_600)).toBeCloseTo(0.82, 2);
    expect(maxOperatingMach(A320, 20_000)).toBeLessThan(0.8);
    expect(maxOperatingMach(A320, 37_000)).toBe(0.82);
  });
});

describe('A320 buffet onset: the warning thresholds (FCOM 0.3 g REC MAX, 0.2 g CRZ FL limit)', () => {
  it('is amber under a 0.3 g margin and red under 0.2 g', () => {
    expect(buffetAlert(0.42)).toBe('none');
    expect(buffetAlert(0.3)).toBe('none');
    expect(buffetAlert(0.29)).toBe('caution');
    expect(buffetAlert(0.2)).toBe('caution');
    expect(buffetAlert(0.19)).toBe('warning');
    expect(buffetAlert(-0.05)).toBe('warning');
  });

  it('is red when the bank needs more than the buffet onset', () => {
    expect(buffetAlert(0.42, 0.01)).toBe('none');
    expect(buffetAlert(0.42, -0.01)).toBe('warning');
  });

  it('cruise case: 68.4 t, CG 29.6 %, FL370, M .78 has a 0.42 g margin and 45 deg of bank', () => {
    const r = evaluateBuffet(A320, { weightTonnes: 68.4, cg: 29.6, pressureAltitude: 37_000, mach: 0.78, bank: 0 });
    expect(r.buffetLoadFactor).toBeCloseTo(1.42, 2);
    expect(r.levelMargin).toBeCloseTo(0.42, 2);
    expect(Math.floor(r.maxBank)).toBe(45);
    expect(Math.round(r.ceiling13 / 100)).toBe(388);
    expect(Math.round(r.ceiling10 / 100)).toBe(443);
    expect(r.range13.low).toBeCloseTo(0.726, 3);
    expect(r.range13.high).toBeCloseTo(0.816, 3);
    expect(r.alert).toBe('none');
  });

  it('near the coffin corner: 76 t, CG 24 %, FL390, M .76 in a 30 deg turn is in buffet', () => {
    const r = evaluateBuffet(A320, { weightTonnes: 76, cg: 24, pressureAltitude: 39_000, mach: 0.76, bank: 30 });
    expect(r.buffetLoadFactor).toBeCloseTo(1.13, 2);
    expect(r.turnLoadFactor).toBeCloseTo(loadFactorForBank(30), 9);
    expect(r.turnMargin).toBeCloseTo(-0.02, 2);
    expect(Math.floor(r.maxBank)).toBe(27);
    expect(r.range13).toBeNull();
    expect(Math.round(r.ceiling13 / 100)).toBe(361);
    expect(r.alert).toBe('warning');
  });
});
