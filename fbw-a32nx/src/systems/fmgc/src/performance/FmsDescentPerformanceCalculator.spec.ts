// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  DescentAntiIce,
  DescentPerformanceError,
  DescentPerformanceEstimate,
  DescentPerformanceInputs,
  DescentType,
} from '@flybywiresim/fbw-sdk';
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

  it('applies the anti-ice corrections of the A320 FCOM table (PER-DES-STD) to the results and the profile', () => {
    const still = a320.calculateDescent(FCOM_TABLE);
    expect(still.estimates).not.toContain(DescentPerformanceEstimate.AntiIce);
    const corrections: [DescentAntiIce, number, number, number][] = [
      [DescentAntiIce.Engine, 1.06, 1.28, 1.03],
      [DescentAntiIce.Total, 1.06, 1.44, 1.04],
    ];
    for (const [antiIce, time, fuel, distance] of corrections) {
      const result = a320.calculateDescent({ ...FCOM_TABLE, antiIce });
      expect(result.time).toBeCloseTo(still.time * time, 6);
      expect(result.fuel).toBeCloseTo(still.fuel * fuel, 6);
      expect(result.distance).toBeCloseTo(still.distance * distance, 6);
      expect(result.points[result.points.length - 1].distance).toBeCloseTo(result.distance, 6);
      expect(result.estimates).toContain(DescentPerformanceEstimate.AntiIce);
    }
  });

  it('descends steeper with the speed brakes', () => {
    const still = a320.calculateDescent(FCOM_TABLE);
    const speedBrakes = a320.calculateDescent({ ...FCOM_TABLE, speedBrakes: true });
    expect(speedBrakes.distance).toBeLessThan(still.distance - 5);
    expect(speedBrakes.time).toBeLessThan(still.time);
  });

  it('flies the MACH, then the SPD, then the SPD LIM below the speed limit altitude', () => {
    const points = a320.calculateDescent(FCOM_TABLE).points;
    const at = (altitude: number) => points.find((p) => p.altitude === altitude)!;
    expect(at(35_000).mach).toBeCloseTo(0.78, 3);
    expect(at(20_000).cas).toBeCloseTo(300, 0);
    expect(at(10_000).cas).toBeCloseTo(250, 0);
    expect(at(5_000).cas).toBeCloseTo(250, 0);
    expect(points.some((p) => p.event === 'DECEL')).toBe(true);
  });

  it('gives the crossover altitude of the speed schedule (ISA)', () => {
    // 300 kt / M.78: 29,314 ft; 300 kt / M.85: 33,638 ft
    expect(a320.crossoverAltitude(a320.standardSchedule)).toBeCloseTo(29_314, -1);
    expect(a380.crossoverAltitude(a380.standardSchedule)).toBeCloseTo(33_638, -1);
  });

  it('gives the average rate and gradient of the whole descent', () => {
    const result = a320.calculateDescent(FCOM_TABLE);
    const height = 39_000 - 1_500;
    expect(result.averageRate).toBeCloseTo(height / (result.time / 60), 6);
    expect(result.averageGradient).toBeCloseTo(-(Math.atan2(height, result.distance * 6076.12) * 180) / Math.PI, 6);
    expect(result.averageGradient).toBeLessThan(-2);
    expect(result.averageGradient).toBeGreaterThan(-4);
  });

  it('checks the altitude, the weight and the given V/S', () => {
    const error = (inputs: Partial<DescentPerformanceInputs>) =>
      a320.calculateDescent({ ...FCOM_TABLE, ...inputs }).error;
    expect(error({ initialAltitude: 39_800 })).toBe(DescentPerformanceError.None);
    expect(error({ initialAltitude: 39_900 })).toBe(DescentPerformanceError.MaximumAltitude);
    expect(error({ weight: 42_500 })).toBe(DescentPerformanceError.None);
    expect(error({ weight: 42_400 })).toBe(DescentPerformanceError.WeightOutOfRange);
    expect(error({ weight: 79_000 })).toBe(DescentPerformanceError.None);
    expect(error({ weight: 79_100 })).toBe(DescentPerformanceError.WeightOutOfRange);
    expect(error({ targetAltitude: 39_000 })).toBe(DescentPerformanceError.TargetAboveInitial);
    expect(error({ headwind: NaN })).toBe(DescentPerformanceError.InvalidData);
    expect(error({ type: DescentType.GivenVs, verticalSpeed: 100 })).toBe(DescentPerformanceError.None);
    expect(error({ type: DescentType.GivenVs, verticalSpeed: 90 })).toBe(DescentPerformanceError.VerticalSpeed);
    expect(error({ type: DescentType.GivenVs })).toBe(DescentPerformanceError.VerticalSpeed);
  });
});
