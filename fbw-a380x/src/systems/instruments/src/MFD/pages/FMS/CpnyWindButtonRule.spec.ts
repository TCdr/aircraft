// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { CpnyWindButtonState, cpnyWindButtonClickAction, isCpnyWindButtonDisabled } from './CpnyWindButtonRule';

const state = (s: Partial<CpnyWindButtonState>): CpnyWindButtonState => ({
  flightPhaseDisallows: false,
  tmpyExists: false,
  uplinkInProgress: false,
  cpnyWindUplinkInProgress: false,
  availableForPlan: false,
  availableForAnyPlan: false,
  ...s,
});

describe('CPNY WIND REQUEST button', () => {
  it('is enabled when nothing is pending', () => {
    expect(isCpnyWindButtonDisabled(state({}))).toBe(false);
  });

  // A380 FCOM a380_fcom.txt l.42124-42128: "When an active wind request is pending, the button displays REQUEST
  // PENDING ... The button gives still access to the COMPANY WIND DATA REQUEST page."
  it('stays enabled while its company wind request is pending', () => {
    expect(isCpnyWindButtonDisabled(state({ uplinkInProgress: true, cpnyWindUplinkInProgress: true }))).toBe(false);
  });

  it('is disabled while a company F-PLN uplink is in progress', () => {
    expect(isCpnyWindButtonDisabled(state({ uplinkInProgress: true }))).toBe(true);
  });

  it('is disabled with a temporary flight plan', () => {
    expect(isCpnyWindButtonDisabled(state({ tmpyExists: true }))).toBe(true);
  });

  it('is disabled when the flight phase no longer allows a request', () => {
    expect(isCpnyWindButtonDisabled(state({ flightPhaseDisallows: true }))).toBe(true);
  });

  it('is disabled while received winds wait for insertion in another plan', () => {
    expect(isCpnyWindButtonDisabled(state({ availableForAnyPlan: true }))).toBe(true);
    expect(isCpnyWindButtonDisabled(state({ availableForPlan: true, availableForAnyPlan: true }))).toBe(false);
  });
});

describe('CPNY WIND REQUEST button click', () => {
  // FCOM l.42114-42131: received winds -> INSERT/CLEAR menu; otherwise (free text option) the request page
  it('opens the INSERT/CLEAR menu when company winds were received for the plan', () => {
    expect(cpnyWindButtonClickAction(true)).toBe('menu');
  });

  it('opens the COMPANY WIND DATA REQUEST page otherwise, also while the request is pending', () => {
    expect(cpnyWindButtonClickAction(false)).toBe('open-request-page');
  });
});
