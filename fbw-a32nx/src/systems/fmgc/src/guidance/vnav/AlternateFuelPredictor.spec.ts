// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import {
  AlternateFuelInputs,
  AlternateFuelPredictor,
  alternateProfileAt,
  alternateProfileSpeed,
} from './AlternateFuelPredictor';

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
  it('uses FL220 below 200 NM and FL310 from 200 NM', () => {
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

describe('AlternateFuelPredictor profile', () => {
  const prediction = () => AlternateFuelPredictor.predict(A380AircraftConfig, inputs({ distance: 300 }))!;

  it('starts at the destination and ends at the alternate with the totals of the prediction', () => {
    const { profile, fuel, time } = prediction();
    expect(profile[0]).toMatchObject({ distance: 0, time: 0, fuel: 0, altitude: 14 });
    const last = profile[profile.length - 1];
    expect(last.distance).toBeCloseTo(300, 3);
    expect(last.fuel).toBeCloseTo(fuel, 3);
    expect(last.time).toBeCloseTo(time, 3);
  });

  it('climbs, cruises at the alternate cruise level and descends, in order of distance', () => {
    const { profile, cruiseAltitude } = prediction();
    for (let i = 1; i < profile.length; i++) {
      expect(profile[i].distance).toBeGreaterThanOrEqual(profile[i - 1].distance);
      expect(profile[i].time).toBeGreaterThanOrEqual(profile[i - 1].time);
      expect(profile[i].fuel).toBeGreaterThanOrEqual(profile[i - 1].fuel);
    }
    expect(Math.max(...profile.map((p) => p.altitude))).toBe(cruiseAltitude);
    expect(profile.some((p) => p.phase === 'cruise' && p.altitude === cruiseAltitude)).toBe(true);
    const phases = profile.map((p) => p.phase).filter((phase, i, all) => i === 0 || phase !== all[i - 1]);
    expect(phases).toEqual(['climb', 'cruise', 'descent']);
  });

  it('interpolates time, fuel and altitude between its points', () => {
    const { profile } = prediction();
    const middle = alternateProfileAt(profile, 150);
    const before = alternateProfileAt(profile, 140);
    const after = alternateProfileAt(profile, 160);
    expect(middle.time).toBeGreaterThan(before.time);
    expect(middle.time).toBeLessThan(after.time);
    expect(alternateProfileAt(profile, -5).distance).toBe(0);
    expect(alternateProfileAt(profile, 999).distance).toBeCloseTo(300, 3);
  });

  it('shows the CAS of the point, or the Mach once that CAS would exceed it', () => {
    const { speeds } = prediction();
    const point = { distance: 0, time: 0, fuel: 0, altitude: 35_000, cas: 290, phase: 'cruise' as const };
    expect(alternateProfileSpeed(point, speeds, 36_090)).toBe(0.84);
    expect(alternateProfileSpeed({ ...point, altitude: 10_000 }, speeds, 36_090)).toBe(290);
  });

  it('uses the cruise level rule of the aircraft', () => {
    const cruiseLevel = (distance: number, rule: 'A320' | 'A380') =>
      AlternateFuelPredictor.predict(A320AircraftConfig, inputs({ distance, cruiseLevelRule: rule }))!.cruiseAltitude;
    expect(cruiseLevel(250, 'A320')).toBe(31_000);
    expect(cruiseLevel(150, 'A320')).toBe(22_000);
    expect(cruiseLevel(150, 'A380')).toBe(22_000);
    expect(cruiseLevel(250, 'A380')).toBe(31_000);
  });

  it('shows the approach speed at both airports and the 250 kt limit below FL100, never a cruise speed', () => {
    const withVapp = AlternateFuelPredictor.predict(A380AircraftConfig, inputs({ distance: 300, approachSpeed: 142 }))!;
    expect(withVapp.profile[0].cas).toBe(142);
    expect(withVapp.profile[withVapp.profile.length - 1].cas).toBe(142);
    const without = AlternateFuelPredictor.predict(A380AircraftConfig, inputs({ distance: 300 }))!;
    expect(without.profile[0].cas).toBe(250);
    expect(without.profile[without.profile.length - 1].cas).toBe(250);
    const lowPoints = without.profile.filter((p) => p.altitude < 10_000);
    expect(lowPoints.every((p) => p.cas <= 250)).toBe(true);
  });
});
