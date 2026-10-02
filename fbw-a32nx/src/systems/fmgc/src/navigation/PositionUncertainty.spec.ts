// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  FmNavigationMode,
  IRS_ALIGNMENT_UNCERTAINTY,
  irsOnlyPositionUncertainty,
  PositionUncertaintyEstimator,
  radioPositionUncertainty,
} from './PositionUncertainty';

const MINUTE = 60_000;

describe('FMS estimated position uncertainty (A320 FCOM DSC-22_20-20-20)', () => {
  it('gives the radio position uncertainty of the FCOM, growing with the distance to the navaids', () => {
    expect(radioPositionUncertainty(FmNavigationMode.IrsDmeDme, 0)).toBeCloseTo(0.27, 6);
    expect(radioPositionUncertainty(FmNavigationMode.IrsDmeDme, 500)).toBeCloseTo(0.37, 6);
    expect(radioPositionUncertainty(FmNavigationMode.IrsVorDme, 0)).toBeCloseTo(0.3, 6);
    expect(radioPositionUncertainty(FmNavigationMode.IrsVorDme, 500)).toBeCloseTo(0.42, 6);
    const halfway = radioPositionUncertainty(FmNavigationMode.IrsVorDme, 50);
    expect(halfway).toBeGreaterThan(0.3);
    expect(halfway).toBeLessThan(0.42);
  });

  it('grows the IRS only uncertainty by the rates of the FCOM', () => {
    expect(irsOnlyPositionUncertainty(0.05, 0)).toBeCloseTo(0.05, 6);
    // +6 NM/h for the first 40 min
    expect(irsOnlyPositionUncertainty(0.05, 40)).toBeCloseTo(4.05, 6);
    // 0 NM/h for the following 50 min
    expect(irsOnlyPositionUncertainty(0.05, 90)).toBeCloseTo(4.05, 6);
    // +4 NM/h for the following 40 min
    expect(irsOnlyPositionUncertainty(0.05, 130)).toBeCloseTo(4.05 + 8 / 3, 6);
    // 0 NM/h for the following 45 min
    expect(irsOnlyPositionUncertainty(0.05, 175)).toBeCloseTo(4.05 + 8 / 3, 6);
    // +2 NM/h after
    expect(irsOnlyPositionUncertainty(0.05, 235)).toBeCloseTo(4.05 + 8 / 3 + 2, 6);
  });

  it('uses the GPS, then a DME pair, then a VOR/DME, then the IRS only', () => {
    const estimator = new PositionUncertaintyEstimator();
    expect(estimator.update(1000, 0.02, [20, 30], 40)).toEqual({ mode: FmNavigationMode.IrsGps, uncertainty: 0.02 });
    expect(estimator.update(1000, null, [20, 30], 40).mode).toBe(FmNavigationMode.IrsDmeDme);
    expect(estimator.update(1000, null, null, 40).mode).toBe(FmNavigationMode.IrsVorDme);
    expect(estimator.update(1000, null, null, null).mode).toBe(FmNavigationMode.IrsOnly);
  });

  it('starts the IRS only growth from the last uncertainty', () => {
    const estimator = new PositionUncertaintyEstimator();
    estimator.update(1000, 0.05, null, null);
    expect(estimator.update(10 * MINUTE, null, null, null).uncertainty).toBeCloseTo(0.05 + 1, 6);
    expect(estimator.update(10 * MINUTE, null, null, null).uncertainty).toBeCloseTo(0.05 + 2, 6);
    // the GPS back: its uncertainty, and a new IRS only period starts from it
    expect(estimator.update(1000, 0.03, null, null).uncertainty).toBeCloseTo(0.03, 6);
    expect(estimator.update(10 * MINUTE, null, null, null).uncertainty).toBeCloseTo(0.03 + 1, 6);
  });

  it('starts at the alignment uncertainty without any earlier position', () => {
    const estimator = new PositionUncertaintyEstimator();
    expect(estimator.update(1000, null, null, null).uncertainty).toBeCloseTo(IRS_ALIGNMENT_UNCERTAINTY, 2);
  });
});
