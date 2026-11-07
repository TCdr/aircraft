// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  FlsCapability,
  flsCapability,
  FlsCapabilityInputs,
  GlsCapability,
  glsCapability,
  GlsCapabilityInputs,
  isLsDeviationValid,
  lsDeviation,
  LsSource,
  lsSource,
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

describe('LS scale deviation source with GLS', () => {
  it('picks GLS over FLS when both are active', () => {
    expect(lsSource(true, true)).toBe(LsSource.Gls);
    expect(lsSource(true, false)).toBe(LsSource.Fls);
    expect(lsSource(false, false)).toBe(LsSource.Ils);
  });

  it('uses the GLS deviation and validity for the GLS source', () => {
    expect(lsDeviation(LsSource.Gls, 0.3, -0.5, 0.7)).toBe(0.7);
    expect(isLsDeviationValid(LsSource.Gls, true, true, false)).toBe(false);
    expect(isLsDeviationValid(LsSource.Gls, false, false, true)).toBe(true);
  });

  it('keeps the ILS and FLS results with an explicit source', () => {
    expect(lsDeviation(LsSource.Ils, 0.3, -0.5, 0.7)).toBe(0.3);
    expect(lsDeviation(LsSource.Fls, 0.3, -0.5, 0.7)).toBe(-0.5);
    expect(isLsDeviationValid(LsSource.Ils, true, false, false)).toBe(true);
    expect(isLsDeviationValid(LsSource.Fls, false, true, false)).toBe(true);
  });

  it('reads a Bool SimVar number 1 as the FLS source and 0 as ILS', () => {
    expect(lsDeviation(1 as unknown as boolean, 0.3, -0.5)).toBe(-0.5);
    expect(lsDeviation(0 as unknown as boolean, 0.3, -0.5)).toBe(0.3);
  });
});

function glsInputs(over: Partial<GlsCapabilityInputs> = {}): GlsCapabilityInputs {
  return {
    glsSelected: true,
    approachModesArmedOrEngaged: true,
    landModesEngaged: false,
    flightGuidanceCat2OrBetter: true,
    gls1LocValid: true,
    gls2LocValid: true,
    gls1GsValid: true,
    gls2GsValid: true,
    ...over,
  };
}

describe('GLS approach capability', () => {
  it('is AUTO LAND when the guidance has CAT 2 or better and both receivers are valid', () => {
    expect(glsCapability(glsInputs())).toBe(GlsCapability.AutoLand);
  });

  it('falls back to CAT 1 without the guidance capability or with one receiver invalid', () => {
    expect(glsCapability(glsInputs({ flightGuidanceCat2OrBetter: false }))).toBe(GlsCapability.Cat1);
    expect(glsCapability(glsInputs({ gls1LocValid: false }))).toBe(GlsCapability.Cat1);
    expect(glsCapability(glsInputs({ gls2GsValid: false }))).toBe(GlsCapability.Cat1);
  });

  it('shows nothing without a GLS selected or with no approach mode armed', () => {
    expect(glsCapability(glsInputs({ glsSelected: false }))).toBe(GlsCapability.None);
    expect(glsCapability(glsInputs({ approachModesArmedOrEngaged: false }))).toBe(GlsCapability.NotArmed);
  });

  it('stays capped through LAND, FLARE and ROLL OUT, when LOC and G/S modes are no longer engaged', () => {
    const landing = { approachModesArmedOrEngaged: false, landModesEngaged: true };
    expect(glsCapability(glsInputs(landing))).toBe(GlsCapability.AutoLand);
    expect(glsCapability(glsInputs({ ...landing, flightGuidanceCat2OrBetter: false }))).toBe(GlsCapability.Cat1);
  });

  it('ignores the G/S validity in LAND, FLARE and ROLL OUT, because the G/S ends at the glide path intercept point', () => {
    const landing = { approachModesArmedOrEngaged: false, landModesEngaged: true };
    expect(glsCapability(glsInputs({ ...landing, gls1GsValid: false, gls2GsValid: false }))).toBe(
      GlsCapability.AutoLand,
    );
    expect(glsCapability(glsInputs({ ...landing, gls2LocValid: false }))).toBe(GlsCapability.Cat1);
    expect(glsCapability(glsInputs({ gls1GsValid: false }))).toBe(GlsCapability.Cat1);
  });

  it('is capped on a selected GLS that is not received: CAT 1 at best, never AUTO LAND', () => {
    const notReceived = { gls1LocValid: false, gls2LocValid: false, gls1GsValid: false, gls2GsValid: false };
    expect(glsCapability(glsInputs(notReceived))).toBe(GlsCapability.Cat1);
  });

  it('has no CAT 2 or CAT 3 value', () => {
    expect(Object.values(GlsCapability).filter((v) => typeof v === 'string')).toEqual([
      'None',
      'NotArmed',
      'Cat1',
      'AutoLand',
    ]);
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

  it('is GLS on a GLS approach, whatever the FLS state', () => {
    expect(lsTitleText(false, false, true)).toBe('GLS');
    expect(lsTitleText(true, true, true)).toBe('GLS');
  });
});
