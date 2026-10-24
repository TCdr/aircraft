// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { AVG_TAXI_SPEED_KT, taxiMinutes } from './taxiTime';

const METRES_PER_NM = 1852;

describe('taxiMinutes', () => {
  it('divides the route length by the average taxi speed and is not marked planned', () => {
    const oneMinuteOfTaxiingM = (AVG_TAXI_SPEED_KT * METRES_PER_NM) / 60;
    expect(taxiMinutes(oneMinuteOfTaxiingM * 10, null)).toEqual({ minutes: 10, planned: false });
  });

  it('prefers the route length over the planned value', () => {
    const oneMinuteOfTaxiingM = (AVG_TAXI_SPEED_KT * METRES_PER_NM) / 60;
    expect(taxiMinutes(oneMinuteOfTaxiingM * 4, 15 * 60)).toEqual({ minutes: 4, planned: false });
  });

  it('falls back to the planned taxi seconds, marked planned', () => {
    expect(taxiMinutes(null, 12 * 60)).toEqual({ minutes: 12, planned: true });
  });

  it('rounds the planned seconds to whole minutes', () => {
    expect(taxiMinutes(null, 12 * 60 + 40)).toEqual({ minutes: 13, planned: true });
  });

  it('is null when both are missing', () => {
    expect(taxiMinutes(null, null)).toBeNull();
  });

  it('never shows less than one minute for a route that exists', () => {
    expect(taxiMinutes(20, null)).toEqual({ minutes: 1, planned: false });
  });
});
