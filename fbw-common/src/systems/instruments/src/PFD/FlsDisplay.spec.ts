// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  FlsCapability,
  flsCapability,
  FlsCapabilityInputs,
  isLsDeviationValid,
  lsDeviation,
  lsTitleText,
} from './FlsDisplay';

/* The FLS indications of the PFD: deviation source, approach capability, LS title */

function inputs(over: Partial<FlsCapabilityInputs> = {}): FlsCapabilityInputs {
  return {
    flsLateralActive: true,
    flsVerticalActive: true,
    approachModesArmedOrEngaged: true,
    flsLocValid: true,
    flsGsValid: true,
    gpsPrimary: true,
    navAccuracyHigh: true,
    fmGpsPositionDisagree: false,
    ...over,
  };
}

describe('LS scale deviation source', () => {
  it('keeps the ILS receiver without an FLS axis', () => {
    expect(lsDeviation(false, 0.3, -0.5)).toBe(0.3);
    expect(isLsDeviationValid(false, true, false)).toBe(true);
    expect(isLsDeviationValid(false, false, true)).toBe(false);
  });

  it('uses the FLS deviation when the axis flies the FLS beam', () => {
    expect(lsDeviation(true, 0.3, -0.5)).toBe(-0.5);
    expect(isLsDeviationValid(true, false, true)).toBe(true);
    expect(isLsDeviationValid(true, true, false)).toBe(false);
  });

  it('returns a real boolean for the Bool SimVars read as numbers', () => {
    expect(isLsDeviationValid(1 as unknown as boolean, 0 as unknown as boolean, 1 as unknown as boolean)).toBe(true);
  });
});

describe('FLS approach capability', () => {
  it('is F-APP with GPS PRIMARY and valid FLS deviations', () => {
    expect(flsCapability(inputs())).toBe(FlsCapability.FApp);
  });

  it('is F-APP + RAW with a HIGH accuracy without GPS PRIMARY', () => {
    expect(flsCapability(inputs({ gpsPrimary: false }))).toBe(FlsCapability.FAppRaw);
  });

  it('is RAW ONLY with a LOW accuracy, invalid deviations or an FM / GPS position disagree', () => {
    expect(flsCapability(inputs({ gpsPrimary: false, navAccuracyHigh: false }))).toBe(FlsCapability.RawOnly);
    expect(flsCapability(inputs({ flsLocValid: false }))).toBe(FlsCapability.RawOnly);
    expect(flsCapability(inputs({ flsGsValid: false }))).toBe(FlsCapability.RawOnly);
    expect(flsCapability(inputs({ fmGpsPositionDisagree: true }))).toBe(FlsCapability.RawOnly);
  });

  it('ignores the F-LOC deviation on a LOC approach (real localizer + F-G/S)', () => {
    expect(flsCapability(inputs({ flsLateralActive: false, flsLocValid: false }))).toBe(FlsCapability.FApp);
    expect(flsCapability(inputs({ flsLateralActive: false, flsGsValid: false }))).toBe(FlsCapability.RawOnly);
  });

  it('shows nothing without an FLS approach or with no approach mode armed or engaged', () => {
    expect(flsCapability(inputs({ flsLateralActive: false, flsVerticalActive: false }))).toBe(FlsCapability.None);
    expect(flsCapability(inputs({ approachModesArmedOrEngaged: false }))).toBe(FlsCapability.None);
  });
});

describe('LS title', () => {
  it('is ILS, FLS, or LOC/FLS on a LOC approach flown with F-G/S', () => {
    expect(lsTitleText(false, false)).toBe('ILS');
    expect(lsTitleText(true, true)).toBe('FLS');
    expect(lsTitleText(false, true)).toBe('LOC/FLS');
  });
});
