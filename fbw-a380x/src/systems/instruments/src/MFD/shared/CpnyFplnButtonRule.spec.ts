// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { isCpnyFplnButtonDisabled, isCpnyFplnSendDisabled } from './CpnyFplnButtonRule';

const Active = FlightPlanIndex.Active;
const Sec1 = FlightPlanIndex.FirstSecondary;
const Sec2 = FlightPlanIndex.FirstSecondary + 1;

describe('CPNY F-PLN REQUEST button (INIT and SEC INDEX pages)', () => {
  it('is disabled during a company wind uplink', () => {
    expect(isCpnyFplnButtonDisabled(true, null, false, false, Active)).toBe(true);
    expect(isCpnyFplnButtonDisabled(true, null, false, false, Sec1)).toBe(true);
  });
  it('is disabled on the INIT page after engine start', () => {
    expect(isCpnyFplnButtonDisabled(false, null, true, false, Active)).toBe(true);
  });
  it('is disabled on the INIT page with an active flight plan with a city pair', () => {
    expect(isCpnyFplnButtonDisabled(false, null, false, true, Active)).toBe(true);
  });
  it('is disabled on the INIT page with a pending request for a SEC flight plan', () => {
    expect(isCpnyFplnButtonDisabled(false, Sec2, false, false, Active)).toBe(true);
  });
  it('is enabled on the INIT page with nothing pending', () => {
    expect(isCpnyFplnButtonDisabled(false, null, false, false, Active)).toBe(false);
  });
  it('is disabled on a SEC INDEX page with a pending request for another flight plan', () => {
    expect(isCpnyFplnButtonDisabled(false, Active, false, false, Sec1)).toBe(true);
    expect(isCpnyFplnButtonDisabled(false, Sec2, false, false, Sec1)).toBe(true);
  });
  it('is enabled on a SEC INDEX page with a pending request for itself (its request page stays reachable)', () => {
    expect(isCpnyFplnButtonDisabled(false, Sec1, false, false, Sec1)).toBe(false);
  });
});

describe('SEND F-PLN REQUEST of the COMPANY F-PLN REQUEST page', () => {
  it('is enabled for the active plan before engine start with nothing pending', () => {
    expect(isCpnyFplnSendDisabled(false, false, false, FlightPlanIndex.Active)).toBe(false);
  });

  it('is disabled while the flight plan request is pending', () => {
    expect(isCpnyFplnSendDisabled(true, false, false, FlightPlanIndex.Active)).toBe(true);
  });

  it('is disabled while a company wind request is pending (from either MFD)', () => {
    expect(isCpnyFplnSendDisabled(false, true, false, FlightPlanIndex.FirstSecondary)).toBe(true);
  });

  it('is disabled for the active plan after engine start, not for a secondary plan', () => {
    expect(isCpnyFplnSendDisabled(false, false, true, FlightPlanIndex.Active)).toBe(true);
    expect(isCpnyFplnSendDisabled(false, false, true, FlightPlanIndex.FirstSecondary)).toBe(false);
  });
});
