// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { destinationFuelAfterTaxi, vnavTripPrediction } from './VnavTripPrediction';

describe('trip fuel and time from the VNAV predictions', () => {
  it('is the fuel burnt from the start of the profile to the destination, in tonnes, and the time in minutes', () => {
    const trip = vnavTripPrediction(22_046.2, 11_023.1, 5_400);
    expect(trip?.tripFuel).toBeCloseTo(5, 3);
    expect(trip?.tripTime).toBe(90);
  });

  it('is not available before the VNAV has a destination prediction (the fuel table is used then)', () => {
    expect(vnavTripPrediction(undefined, 11_000, 5_400)).toBe(null);
    expect(vnavTripPrediction(22_000, undefined, 5_400)).toBe(null);
    expect(vnavTripPrediction(22_000, 11_000, undefined)).toBe(null);
    expect(vnavTripPrediction(22_000, NaN, 5_400)).toBe(null);
    expect(vnavTripPrediction(22_000, 11_000, 0)).toBe(null);
  });
});

describe('destination EFOB of the F-PLN page', () => {
  it('deducts the taxi fuel before takeoff, as the FUEL PRED page', () => {
    expect(destinationFuelAfterTaxi(11_023.1, 0.2, false)).toBeCloseTo(11_023.1 - 440.92, 1);
    expect(destinationFuelAfterTaxi(11_023.1, 0.2, true)).toBe(11_023.1);
    expect(destinationFuelAfterTaxi(11_023.1, null, false)).toBe(11_023.1);
    expect(destinationFuelAfterTaxi(null, 0.2, false)).toBe(null);
  });
});
