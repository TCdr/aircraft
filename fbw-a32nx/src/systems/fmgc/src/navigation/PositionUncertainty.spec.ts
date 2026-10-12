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

  it('is at least the distance between the FM position and the GPIRS or radio position (A380 FCOM l.23009-23022)', () => {
    const estimator = new PositionUncertaintyEstimator();
    expect(estimator.update(1000, 0.02, null, null, 0.4, 0).uncertainty).toBeCloseTo(0.4, 6);
    expect(estimator.update(1000, 0.02, null, null, 0.01, 3).uncertainty).toBeCloseTo(0.02, 6);
    expect(estimator.update(1000, null, [1, 1], null, 0, 1.5).uncertainty).toBeCloseTo(1.5, 6);
    expect(estimator.update(1000, null, null, 1, 0, 0.1).uncertainty).toBeCloseTo(0.3, 2);
  });

  it('is 0.2 NM after a position update on ground (A320 FCOM l.12446, A380 FCOM l.23042)', () => {
    const estimator = new PositionUncertaintyEstimator();
    expect(estimator.update(1000, null, null, null).uncertainty).toBeCloseTo(IRS_ALIGNMENT_UNCERTAINTY, 2);
    estimator.positionUpdate(true, 0.4);
    // the IRS only growth starts again from 0.2 NM: +6 NM/h for 10 min
    expect(estimator.update(10 * MINUTE, null, null, null).uncertainty).toBeCloseTo(0.2 + 1, 6);
  });

  it('adds the update distance to the previous EPU after an update in flight in IRS only (A380 FCOM l.23057)', () => {
    const estimator = new PositionUncertaintyEstimator();
    estimator.update(1000, 0.05, null, null);
    estimator.update(10 * MINUTE, null, null, null);
    estimator.positionUpdate(false, 2);
    expect(estimator.update(0, null, null, null).uncertainty).toBeCloseTo(0.05 + 1 + 2, 6);
  });
});
