// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { a320AlternatePrediction, alternateZeroFuelWeight } from './A320AlternatePrediction';

const inputs = (overrides = {}) => ({
  distance: 150,
  destinationElevation: 13,
  alternateElevation: 100,
  zeroFuelWeight: 58,
  fuelAtDestination: 2.5,
  headwind: 0,
  tropopause: null,
  isaDeviation: 0,
  approachSpeed: 135,
  ...overrides,
});

describe('a320AlternatePrediction', () => {
  it('uses the A320 cruise levels: FL100 below 100 NM, FL220 to 200 NM, else FL310', () => {
    expect(a320AlternatePrediction(inputs({ distance: 90 }))?.cruiseAltitude).toBeLessThanOrEqual(10_000);
    expect(a320AlternatePrediction(inputs({ distance: 150 }))?.cruiseAltitude).toBe(22_000);
    expect(a320AlternatePrediction(inputs({ distance: 250 }))?.cruiseAltitude).toBe(31_000);
  });

  it('gives a plausible A320 trip to a 250 NM alternate, beyond the FM tables', () => {
    const prediction = a320AlternatePrediction(inputs({ distance: 250 }))!;
    const fuelKg = prediction.fuel * 0.45359237;
    expect(fuelKg).toBeGreaterThan(1300);
    expect(fuelKg).toBeLessThan(2600);
    expect(prediction.time / 60).toBeGreaterThan(35);
    expect(prediction.time / 60).toBeLessThan(65);
  });

  it('has the profile end at the alternate distance', () => {
    const prediction = a320AlternatePrediction(inputs())!;
    expect(prediction.profile[prediction.profile.length - 1].distance).toBeCloseTo(150, 3);
  });

  it('shows the approach speed at the airports', () => {
    const prediction = a320AlternatePrediction(inputs())!;
    expect(prediction.profile[0].cas).toBe(135);
    expect(prediction.profile[prediction.profile.length - 1].cas).toBe(135);
  });

  it('burns more with a headwind', () => {
    expect(a320AlternatePrediction(inputs({ headwind: 40 }))!.fuel).toBeGreaterThan(
      a320AlternatePrediction(inputs())!.fuel,
    );
  });
});

describe('the alternate prediction without approach data or ZFW (aircraft at the gate)', () => {
  it('still gives a profile when the approach speed is 0, NaN or undefined', () => {
    for (const approachSpeed of [0, NaN, undefined as unknown as number]) {
      const prediction = a320AlternatePrediction(inputs({ approachSpeed }));
      expect(prediction).not.toBeNull();
      expect(prediction!.profile[0].cas).toBeLessThanOrEqual(250);
    }
  });

  it('bases the weight on the table reference weight before the ZFW is entered', () => {
    expect(alternateZeroFuelWeight(58, 2.1)).toBe(58);
    expect(alternateZeroFuelWeight(null, 2.1)).toBeCloseTo(55 - 2.1, 6);
    expect(a320AlternatePrediction(inputs({ zeroFuelWeight: alternateZeroFuelWeight(null, 2.1) }))).not.toBeNull();
  });
});
