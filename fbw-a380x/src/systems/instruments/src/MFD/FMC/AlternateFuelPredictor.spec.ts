// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import { AlternateFuelInputs, AlternateFuelPredictor } from './AlternateFuelPredictor';

const TONNE_TO_LB = 2204.62;

const inputs = (overrides: Partial<AlternateFuelInputs> = {}): AlternateFuelInputs => ({
  distance: 300,
  destinationElevation: 14,
  alternateElevation: 92,
  zeroFuelWeight: 344 * TONNE_TO_LB,
  fuelOnBoard: 12.5 * TONNE_TO_LB,
  ...overrides,
});

const fuelTonnes = (overrides: Partial<AlternateFuelInputs> = {}) =>
  AlternateFuelPredictor.predict(A380AircraftConfig, inputs(overrides))!.fuel / TONNE_TO_LB;

describe('AlternateFuelPredictor', () => {
  it('uses FL220 below 200 NM and FL310 from 200 NM (FCOM)', () => {
    expect(AlternateFuelPredictor.predict(A380AircraftConfig, inputs({ distance: 199 }))?.cruiseAltitude).toBe(22_000);
    expect(AlternateFuelPredictor.predict(A380AircraftConfig, inputs({ distance: 200 }))?.cruiseAltitude).toBe(31_000);
  });

  it('lowers the cruise altitude when the distance is too short for the climb and descent', () => {
    const prediction = AlternateFuelPredictor.predict(A380AircraftConfig, inputs({ distance: 60 }));
    expect(prediction?.cruiseAltitude).toBeLessThan(22_000);
    expect(prediction?.fuel).toBeGreaterThan(0);
  });

  it('gives a plausible A380 alternate fuel and time', () => {
    const prediction = AlternateFuelPredictor.predict(A380AircraftConfig, inputs())!;
    expect(prediction.fuel / TONNE_TO_LB).toBeGreaterThan(6);
    expect(prediction.fuel / TONNE_TO_LB).toBeLessThan(12);
    expect(prediction.time / 60).toBeGreaterThan(35);
    expect(prediction.time / 60).toBeLessThan(65);
  });

  it('needs more fuel for a longer distance, a headwind and a heavier aircraft', () => {
    const base = fuelTonnes();
    expect(fuelTonnes({ distance: 450 })).toBeGreaterThan(base);
    expect(fuelTonnes({ headwind: 30 })).toBeGreaterThan(base);
    expect(fuelTonnes({ headwind: -30 })).toBeLessThan(base);
    expect(fuelTonnes({ zeroFuelWeight: 370 * TONNE_TO_LB })).toBeGreaterThan(base);
  });

  it('gives no result without a valid distance or weight', () => {
    expect(AlternateFuelPredictor.predict(A380AircraftConfig, inputs({ distance: 0 }))).toBeNull();
    expect(AlternateFuelPredictor.predict(A380AircraftConfig, inputs({ zeroFuelWeight: NaN }))).toBeNull();
  });
});
