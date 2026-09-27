// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { DescentAntiIce, DescentPerformanceError, DescentPerformanceInputs, DescentType } from '@flybywiresim/fbw-sdk';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import { FmsDescentPerformanceCalculator } from './FmsDescentPerformanceCalculator';

const a320 = new FmsDescentPerformanceCalculator(A320AircraftConfig, {
  standardSchedule: { mach: 0.78, cas: 300, limitCas: 250, limitAltitude: 10_000 },
  mmo: 0.82,
  vmo: 350,
  maxAltitude: 39_800,
  oew: 42_500,
  mtow: 79_000,
});

const a380 = new FmsDescentPerformanceCalculator(A380AircraftConfig, {
  standardSchedule: { mach: 0.85, cas: 300, limitCas: 250, limitAltitude: 10_000 },
  mmo: 0.89,
  vmo: 340,
  maxAltitude: 43_100,
  oew: 300_006,
  mtow: 510_000,
});

/** The A320 FCOM descent table (PER-DES-STD): M.78/300KT/250KT, idle, ISA, from FL390 to 1500 ft, 65 t */
const FCOM_TABLE: DescentPerformanceInputs = {
  type: DescentType.Standard,
  initialAltitude: 39_000,
  targetAltitude: 1_500,
  weight: 65_000,
  isaDeviation: 0,
  headwind: 0,
  antiIce: DescentAntiIce.Off,
  speedBrakes: false,
  fuelFactor: 0,
  schedule: a320.standardSchedule,
};

describe('Descent performance', () => {
  it('is close to the A320 FCOM descent table', () => {
    // FCOM (CFM56 A320): 17.4 min, 106 NM; the FBW A320neo model within 10 %
    const result = a320.calculateDescent(FCOM_TABLE);
    expect(result.error).toBe(DescentPerformanceError.None);
    expect(result.time / 60).toBeGreaterThan(17.4 * 0.9);
    expect(result.time / 60).toBeLessThan(17.4 * 1.1);
    expect(result.distance).toBeGreaterThan(106 * 0.9);
    expect(result.distance).toBeLessThan(106 * 1.1);
    expect(result.points[0].altitude).toBe(39_000);
    expect(result.points[result.points.length - 1].altitude).toBe(1_500);
    expect(result.points.some((p) => p.event === 'CROSSOVER')).toBe(true);
    expect(result.points.find((p) => p.event === 'SPD LIM')?.altitude).toBe(10_000);
  });

  it('applies the wind, the temperature and the anti-ice', () => {
    const still = a380.calculateDescent({ ...FCOM_TABLE, weight: 380_000, schedule: a380.standardSchedule });
    const headwind = a380.calculateDescent({
      ...FCOM_TABLE,
      weight: 380_000,
      schedule: a380.standardSchedule,
      headwind: 50,
    });
    // A headwind shortens the distance, not the time (A380 FCOM PER-IFT-DES-CDT, wind)
    expect(headwind.distance).toBeLessThan(still.distance - 10);
    expect(headwind.time).toBeCloseTo(still.time, -1);
    const antiIce = a380.calculateDescent({
      ...FCOM_TABLE,
      weight: 380_000,
      schedule: a380.standardSchedule,
      antiIce: DescentAntiIce.Total,
    });
    expect(antiIce.fuel).toBeCloseTo(still.fuel * 1.44, 0);
  });

  it('descends faster in EMERGENCY, and checks the given V/S', () => {
    const standard = a380.calculateDescent({
      ...FCOM_TABLE,
      initialAltitude: 41_000,
      targetAltitude: 10_000,
      weight: 380_000,
      schedule: a380.standardSchedule,
    });
    const emergency = a380.calculateDescent({ ...standard.inputs, type: DescentType.Emergency });
    expect(emergency.averageRate).toBeGreaterThan(2 * standard.averageRate);
    // A V/S steeper than idle is flown at idle where it is not achievable
    const tooSteep = a380.calculateDescent({ ...standard.inputs, type: DescentType.GivenVs, verticalSpeed: 9000 });
    expect(tooSteep.verticalSpeedIdleBelow).toBe(41_000);
    expect(tooSteep.time).toBeCloseTo(standard.time, -1);
    const givenVs = a380.calculateDescent({ ...standard.inputs, type: DescentType.GivenVs, verticalSpeed: 1000 });
    expect(givenVs.verticalSpeedIdleBelow).toBeUndefined();
    expect(givenVs.averageRate).toBeCloseTo(1000, -1);
    expect(givenVs.distance).toBeGreaterThan(standard.distance);
    expect(a380.calculateDescent({ ...standard.inputs, targetAltitude: 45_000 }).error).toBe(
      DescentPerformanceError.TargetAboveInitial,
    );
  });
});
