// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FinalHoldingPredictor, roundFuelUpToTenthTonne } from './FinalHoldingPredictor';

/** Tonnes per thousand pounds */
const KLB_TO_T = 0.453_592_37;

describe('FinalHoldingPredictor', () => {
  it('reproduces the FCOM IN-FLT PERF holding (PER-IFT-HLD-HMI: 940.0 klb, 30 min, ISA+10 -> 13100 lb, 926.9 klb)', () => {
    // The figure is at ISA+10, the FINAL fuel at ISA: the ISA fuel flow is the figure's one less 3 % (0.3 %/°C)
    const isaFuelKlb = FinalHoldingPredictor.fuelForTime(926.9 * KLB_TO_T, 30)! / KLB_TO_T;
    expect(isaFuelKlb * 1.03).toBeCloseTo(13.1, 1);
    const isaAverageFlowLbPerHour = (isaFuelKlb * 1000) / 0.5;
    expect(isaAverageFlowLbPerHour * 1.03).toBeGreaterThan(26_100);
    expect(isaAverageFlowLbPerHour * 1.03).toBeLessThan(26_300);
  });

  it('gives the FINAL of the airline flight plans (RJTT-RKSI OFP: 4.8 t at ZFW 342.6 t; FCOM 10 600 lb)', () => {
    const fuel = FinalHoldingPredictor.fuelForTime(342.6, 30)!;
    expect(fuel).toBeCloseTo(4.7, 1);
    // Within 3 % of the OFP and of the FCOM conservative quantity (4.81 t)
    expect(Math.abs(fuel - 4.8) / 4.8).toBeLessThan(0.03);
  });

  it('burns in proportion to the weight', () => {
    const light = FinalHoldingPredictor.fuelForTime(250, 30)!;
    const heavy = FinalHoldingPredictor.fuelForTime(500, 30)!;
    expect(heavy / light).toBeCloseTo(2, 5);
    expect(FinalHoldingPredictor.fuelForTime(342.6, 45)!).toBeGreaterThan(
      FinalHoldingPredictor.fuelForTime(342.6, 30)! * 1.5,
    );
  });

  it('uses the FCOM conservative 10 600 lb per 30 min without a ZFW', () => {
    expect(FinalHoldingPredictor.fuelForTime(null, 30)).toBeCloseTo(4.808, 3);
    expect(FinalHoldingPredictor.timeForFuel(null, 4.808)).toBeCloseTo(30, 1);
  });

  it('gives back the time of a fuel (FINAL fuel entry, EXTRA fuel)', () => {
    const fuel = FinalHoldingPredictor.fuelForTime(342.6, 30)!;
    expect(FinalHoldingPredictor.timeForFuel(342.6, fuel)).toBeCloseTo(30, 6);
    // RJTT-RKSI: the OFP FINAL 4.8 t lasts a bit more than 30 min
    const ofpMinutes = FinalHoldingPredictor.timeForFuel(342.6, 4.8)!;
    expect(ofpMinutes).toBeGreaterThan(30);
    expect(ofpMinutes).toBeLessThan(31.5);
    expect(FinalHoldingPredictor.timeForFuel(342.6, 0)).toBe(0);
  });

  it('rounds the calculated FINAL fuel up to 0.1 t like the ALTN fuel (RJTT-RKSI: 4.70 t -> 4.8 t, OFP 4.8 t)', () => {
    expect(FinalHoldingPredictor.calculatedFinalFuel(342.6, 30)).toBe(4.8);
    // ZFW 300 t: 4.12 t -> 4.2 t
    expect(FinalHoldingPredictor.calculatedFinalFuel(300, 30)).toBe(4.2);
    // Without a ZFW: the FCOM 10 600 lb (4.81 t) -> 4.9 t
    expect(FinalHoldingPredictor.calculatedFinalFuel(null, 30)).toBe(4.9);
    expect(FinalHoldingPredictor.calculatedFinalFuel(342.6, null)).toBeNull();
  });

  it('rounds a fuel up to the next tenth of a tonne, but not a computation noise above an exact tenth', () => {
    expect(roundFuelUpToTenthTonne(4.70001)).toBe(4.8);
    expect(roundFuelUpToTenthTonne(4.7)).toBe(4.7);
    expect(roundFuelUpToTenthTonne(0.1 + 0.2)).toBe(0.3);
    expect(roundFuelUpToTenthTonne(6.21)).toBe(6.3);
    expect(roundFuelUpToTenthTonne(0)).toBe(0);
  });

  it('has no result without a valid time or fuel', () => {
    expect(FinalHoldingPredictor.fuelForTime(342.6, null)).toBeNull();
    expect(FinalHoldingPredictor.fuelForTime(342.6, NaN)).toBeNull();
    expect(FinalHoldingPredictor.timeForFuel(342.6, -1)).toBeNull();
    expect(FinalHoldingPredictor.timeForFuel(342.6, null)).toBeNull();
  });
});
