// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A380Failure } from '@failures';
import { isSurvSystemLost, wxrFunctionsFailed } from './SurvSystemFailures';

const failures =
  (...active: number[]) =>
  (failure: number) =>
    active.includes(failure);

describe('a SURV system lost as a whole', () => {
  it('is lost with its AESU failure or its AESU reset, not with the other system', () => {
    expect(isSurvSystemLost(1, failures(A380Failure.SurvSystem1), false)).toBe(true);
    expect(isSurvSystemLost(1, failures(), true)).toBe(true);
    expect(isSurvSystemLost(1, failures(A380Failure.SurvSystem2), false)).toBe(false);
    expect(isSurvSystemLost(2, failures(A380Failure.SurvSystem2), false)).toBe(true);
  });
});

describe('the WXR functions of a SURV system', () => {
  it('fail one by one with their own failure', () => {
    expect(wxrFunctionsFailed(1, failures(A380Failure.WxrTurbulence1), false, true)).toEqual({
      wxDisplay: false,
      turbulence: true,
      predictiveWindshear: false,
    });
    expect(wxrFunctionsFailed(2, failures(A380Failure.WxrPredictiveWindshear2), false, true)).toEqual({
      wxDisplay: false,
      turbulence: false,
      predictiveWindshear: true,
    });
    expect(wxrFunctionsFailed(1, failures(A380Failure.WxrDisplay1), false, true).wxDisplay).toBe(true);
    expect(wxrFunctionsFailed(2, failures(A380Failure.WxrDisplay1), false, true).wxDisplay).toBe(false);
  });

  it('all fail with the system lost or unpowered', () => {
    const allFailed = { wxDisplay: true, turbulence: true, predictiveWindshear: true };
    expect(wxrFunctionsFailed(1, failures(), true, true)).toEqual(allFailed);
    expect(wxrFunctionsFailed(2, failures(), false, false)).toEqual(allFailed);
  });
});
