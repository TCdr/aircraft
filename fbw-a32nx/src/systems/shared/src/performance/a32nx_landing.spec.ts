// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  LandingAntiIce,
  LandingApproachType,
  LandingBrakingMode,
  LandingComputationType,
  LandingConf,
  LandingLimitation,
  LandingPerformanceError,
  LandingPerformanceInputs,
  LandingRunwayCondition,
} from '@flybywiresim/fbw-sdk';
import { A320251NLandingCalculator } from './a32nx_landing';

const calculator = new A320251NLandingCalculator();

/** The first example of the A320 FCOM (PER-LDG-DIS-RLD P 3): CONF FULL, 58 t, dry, 2000 ft, VLS, 5 kt tailwind, ISA */
const EXAMPLE: LandingPerformanceInputs = {
  type: LandingComputationType.Dispatch,
  weight: 58_000,
  conf: LandingConf.Full,
  lda: 3000,
  elevation: 2000,
  slope: 0,
  headwind: -5,
  crosswind: 0,
  oat: 11,
  qnh: 1013.25,
  runwayCondition: LandingRunwayCondition.Dry,
  antiIce: LandingAntiIce.Off,
  airConditioning: true,
  approachType: LandingApproachType.Normal,
  goAroundGradient: 0,
  speedIncrement: 0,
  autoland: false,
  glideSlope: 3,
  brakingMode: LandingBrakingMode.Manual,
  reverseThrust: false,
  overweightProcedure: false,
};

describe('A320 landing performance', () => {
  it('computes the required landing distance of the FCOM example', () => {
    // RLD (DRY, 2000 ft, VLS, 5 kt TW) = 1330 + 2 x 60 + 150
    const result = calculator.calculateLandingPerformance(EXAMPLE);
    expect(result.error).toBe(LandingPerformanceError.None);
    expect(result.landingDistance).toBeCloseTo(1600, 0);
    expect(result.stopMargin).toBeCloseTo(1400, 0);
  });

  it('keeps the wet runway distance on a contaminated runway when it is longer (EU-OPS)', () => {
    // Second FCOM example: standing water, 2000 ft, no wind, all reversers: 1700 + 2 x 130 - 2 x 80 = 1800 m,
    // longer than the wet one, 1530 + 2 x 70 = 1670 m
    const water = calculator.calculateLandingPerformance({
      ...EXAMPLE,
      headwind: 0,
      runwayCondition: LandingRunwayCondition.StandingWater,
      reverseThrust: true,
    });
    expect(water.landingDistance).toBeCloseTo(1800, 0);
    expect(water.reverseCredit).toBe(true);

    // Compacted snow with reversers: 1620 + 2 x 80 - 2 x 70 = 1640 m < wet 1670 m
    const snow = calculator.calculateLandingPerformance({
      ...EXAMPLE,
      headwind: 0,
      runwayCondition: LandingRunwayCondition.CompactedSnow,
      reverseThrust: true,
    });
    expect(snow.landingDistance).toBeCloseTo(1670, 0);
  });

  it('gives the in-flight landing distances of the QRH, with the 15 % margin', () => {
    const result = calculator.calculateLandingPerformance({
      ...EXAMPLE,
      type: LandingComputationType.InFlight,
      weight: 68_000,
      elevation: 0,
      headwind: 0,
      oat: 15,
    });
    expect(result.actualLandingDistance).toBeCloseTo(1060, 0);
    expect(result.landingDistance).toBeCloseTo(1060 * 1.15, 0);
    expect(result.brakingDistances.map((d) => d.distance)).toEqual([1060, 1330, 1860]);
  });

  it('gives reverser credit only where the QRH has a correction', () => {
    const type = LandingComputationType.InFlight;
    const manual = LandingBrakingMode.Manual;
    expect(calculator.reverseThrustAvailable(type, LandingRunwayCondition.Dry, LandingConf.Full, manual)).toBe(false);
    expect(calculator.reverseThrustAvailable(type, LandingRunwayCondition.Dry, LandingConf.Conf3, manual)).toBe(true);
    expect(calculator.reverseThrustAvailable(type, LandingRunwayCondition.Poor, LandingConf.Full, manual)).toBe(true);
    const poor = { ...EXAMPLE, type, weight: 68_000, elevation: 0, headwind: 0, oat: 15 };
    const without = calculator.calculateLandingPerformance({ ...poor, runwayCondition: LandingRunwayCondition.Poor });
    const withReversers = calculator.calculateLandingPerformance({
      ...poor,
      runwayCondition: LandingRunwayCondition.Poor,
      reverseThrust: true,
    });
    // POOR, MAX MANUAL, CONF FULL: 2760 m, - 370 m per reverser
    expect(without.actualLandingDistance).toBeCloseTo(2760, 0);
    expect(withReversers.actualLandingDistance).toBeCloseTo(2760 - 740, 0);
    expect(withReversers.reverseCredit).toBe(true);
    expect(
      calculator.reverseThrustAvailable(
        LandingComputationType.Dispatch,
        LandingRunwayCondition.Wet,
        LandingConf.Full,
        manual,
      ),
    ).toBe(false);
  });

  it('finds the MLW(PERF) of the runway length', () => {
    const result = calculator.calculateLandingPerformance({ ...EXAMPLE, lda: 1600 });
    expect(result.mlwPerf / 1000).toBeCloseTo(58, 1);
    const short = calculator.calculateLandingPerformance({ ...EXAMPLE, lda: 1500 });
    expect(short.limitation).toBe(LandingLimitation.Lda);
  });

  it('checks the limits and the runway conditions of each computation', () => {
    expect(calculator.calculateLandingPerformance({ ...EXAMPLE, weight: 70_000 }).error).toBe(
      LandingPerformanceError.MaximumLandingWeight,
    );
    expect(
      calculator.calculateLandingPerformance({ ...EXAMPLE, runwayCondition: LandingRunwayCondition.Medium }).error,
    ).toBe(LandingPerformanceError.RunwayCondition);
    expect(calculator.crosswindLimit(LandingRunwayCondition.CompactedSnow, -20)).toBe(29);
    expect(calculator.crosswindLimit(LandingRunwayCondition.Poor, 0)).toBe(15);
  });
});
