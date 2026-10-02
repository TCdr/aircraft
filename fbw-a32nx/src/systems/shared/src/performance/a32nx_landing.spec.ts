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
  LandingPerformanceEstimate,
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

  describe('in-flight landing distance corrections (QRH, dry, MAX manual braking, CONF FULL: 1060 m at 68 t)', () => {
    const IN_FLIGHT: LandingPerformanceInputs = {
      ...EXAMPLE,
      type: LandingComputationType.InFlight,
      weight: 68_000,
      elevation: 0,
      headwind: 0,
      oat: 15,
    };
    const actual = (inputs: Partial<LandingPerformanceInputs>) =>
      calculator.calculateLandingPerformance({ ...IN_FLIGHT, ...inputs }).actualLandingDistance;

    it('adds 40 m per 1000 ft of pressure altitude', () => {
      // 2000 ft at ISA (11 °C): no temperature correction
      expect(actual({ elevation: 2000, oat: 11 })).toBeCloseTo(1060 + 2 * 40, 0);
    });

    it('adds 20 m per % of downhill slope, nothing uphill', () => {
      expect(actual({ slope: -1.5 })).toBeCloseTo(1060 + 1.5 * 20, 6);
      expect(actual({ slope: 1.5 })).toBeCloseTo(1060, 6);
    });

    it('adds 30 m per 10 °C above ISA, nothing below', () => {
      expect(actual({ oat: 35 })).toBeCloseTo(1060 + 2 * 30, 6);
      expect(actual({ oat: -5 })).toBeCloseTo(1060, 6);
    });

    it('adds 130 m per 5 kt of tailwind and 70 m per 5 kt of speed increment', () => {
      expect(actual({ headwind: -10 })).toBeCloseTo(1060 + 2 * 130, 6);
      expect(actual({ speedIncrement: 10 })).toBeCloseTo(1060 + 2 * 70, 6);
    });

    it('adds the autoland distance of the configuration', () => {
      expect(actual({ autoland: true })).toBeCloseTo(1060 + 280, 6);
      // CONF 3: 1210 m + 250 m
      expect(actual({ conf: LandingConf.Conf3, autoland: true })).toBeCloseTo(1210 + 250, 6);
    });

    it('finds the MLW(PERF) of the factored in-flight distance', () => {
      // 1060 m x 1.15 = 1219 m: exactly the 68 t distance
      const result = calculator.calculateLandingPerformance({ ...IN_FLIGHT, lda: 1219 });
      expect(result.mlwPerf / 1000).toBeCloseTo(68, 1);
    });
  });

  describe('airborne phase', () => {
    it('is 7 s from the threshold to the touchdown at VAPP plus the tailwind', () => {
      // VLS CONF FULL at 58 t = 123 kt, VAPP = VLS (speed increment 0), 5 kt of tailwind: 7 s at 128 kt
      const result = calculator.calculateLandingPerformance(EXAMPLE);
      expect(result.vapp).toBe(123);
      expect(result.airDistance).toBeCloseTo(7 * 128 * 0.514444, 3);
    });

    it('takes no credit for a headwind', () => {
      const result = calculator.calculateLandingPerformance({ ...EXAMPLE, headwind: 10 });
      expect(result.airDistance).toBeCloseTo(7 * 123 * 0.514444, 3);
    });
  });

  describe('autoland (FCOM PER-LDG-DIS-RLA)', () => {
    const conf3 = { ...EXAMPLE, conf: LandingConf.Conf3, headwind: 0 };
    const distance = (inputs: Partial<LandingPerformanceInputs>) =>
      calculator.calculateLandingPerformance({ ...EXAMPLE, ...inputs }).landingDistance!;

    it('adds 240 m in CONF 3 with no wind or a headwind', () => {
      expect(distance({ ...conf3, autoland: true }) - distance(conf3)).toBeCloseTo(240, 6);
      expect(distance({ ...conf3, headwind: 10, autoland: true }) - distance({ ...conf3, headwind: 10 })).toBeCloseTo(
        240,
        6,
      );
      expect(distance({ ...conf3, headwind: -5, autoland: true })).toBeCloseTo(distance({ ...conf3, headwind: -5 }), 6);
    });

    it('adds 170 m in CONF FULL with a headwind only', () => {
      expect(distance({ headwind: 10, autoland: true }) - distance({ headwind: 10 })).toBeCloseTo(170, 6);
      expect(distance({ headwind: 0, autoland: true })).toBeCloseTo(distance({ headwind: 0 }), 6);
    });

    it('adds nothing above 70 t', () => {
      // MLW(PERF) of a 2200 m runway is above 70 t: the same with and without autoland
      const manual = calculator.calculateLandingPerformance({ ...conf3, lda: 2200 });
      const auto = calculator.calculateLandingPerformance({ ...conf3, lda: 2200, autoland: true });
      expect(manual.mlwPerf).toBeGreaterThan(70_000);
      expect(auto.mlwPerf).toBeCloseTo(manual.mlwPerf, 0);
    });
  });

  it('caps the MLW(PERF) at 100 t on a very long runway', () => {
    expect(calculator.calculateLandingPerformance({ ...EXAMPLE, lda: 9000 }).mlwPerf).toBe(100_000);
  });

  describe('VAPP', () => {
    it('is VLS plus the speed increment', () => {
      const result = calculator.calculateLandingPerformance({ ...EXAMPLE, speedIncrement: 5 });
      expect(result.vapp).toBe(123 + 5);
    });

    it('takes the wind increment of the headwind when no speed increment is entered', () => {
      // 18 kt of headwind: + 6 kt, and 100 m per 5 kt in the dispatch table (CONF FULL, dry)
      const withWind = calculator.calculateLandingPerformance({ ...EXAMPLE, headwind: 18, speedIncrement: undefined });
      const noIncrement = calculator.calculateLandingPerformance({ ...EXAMPLE, headwind: 18 });
      expect(withWind.speedIncrement).toBe(6);
      expect(withWind.vapp).toBe(129);
      expect(withWind.landingDistance! - noIncrement.landingDistance!).toBeCloseTo((6 / 5) * 100, 6);
    });
  });

  it('adds the in-flight weight correction below and above 68 t', () => {
    const actual = (weight: number) =>
      calculator.calculateLandingPerformance({
        ...EXAMPLE,
        type: LandingComputationType.InFlight,
        weight,
        elevation: 0,
        headwind: 0,
        oat: 15,
      }).actualLandingDistance;
    // dry, MAX manual, CONF FULL: - 10 m per t below 68 t, + 50 m per t above
    expect(actual(60_000)).toBeCloseTo(1060 - 8 * 10, 6);
    expect(actual(72_000)).toBeCloseTo(1060 + 4 * 50, 6);
  });

  it('flags an overweight landing in flight only', () => {
    const inFlight = { ...EXAMPLE, type: LandingComputationType.InFlight, elevation: 0, headwind: 0, oat: 15 };
    // MLW 67.4 t
    expect(calculator.calculateLandingPerformance({ ...inFlight, weight: 67_400 }).overweight).toBe(false);
    expect(calculator.calculateLandingPerformance({ ...inFlight, weight: 67_500 }).overweight).toBe(true);
    expect(calculator.calculateLandingPerformance({ ...EXAMPLE, weight: 67_400 }).overweight).toBe(false);
  });

  it('gives the reverser credit only with the reversers selected', () => {
    const conf3 = { ...EXAMPLE, type: LandingComputationType.InFlight, conf: LandingConf.Conf3, elevation: 0 };
    expect(calculator.calculateLandingPerformance({ ...conf3, reverseThrust: false }).reverseCredit).toBe(false);
    expect(calculator.calculateLandingPerformance({ ...conf3, reverseThrust: true }).reverseCredit).toBe(true);
    // CONF FULL dry: no reverser correction in the QRH
    expect(
      calculator.calculateLandingPerformance({ ...conf3, conf: LandingConf.Full, reverseThrust: true }).reverseCredit,
    ).toBe(false);
  });

  it('marks the MLW(PERF) above the dispatch tables as an estimate', () => {
    expect(calculator.calculateLandingPerformance({ ...EXAMPLE, lda: 9000 }).estimates).toContain(
      LandingPerformanceEstimate.MlwPerf,
    );
    expect(calculator.calculateLandingPerformance({ ...EXAMPLE, lda: 1600 }).estimates).not.toContain(
      LandingPerformanceEstimate.MlwPerf,
    );
  });

  it('keeps the limits of the FCOM (LIM-12): OEW, MTOW, 9200 ft, 15 kt of tailwind, 2 % slope', () => {
    const inFlight = { ...EXAMPLE, type: LandingComputationType.InFlight };
    const error = (inputs: Partial<LandingPerformanceInputs>) =>
      calculator.calculateLandingPerformance({ ...inFlight, ...inputs }).error;
    expect(error({ weight: 42_500 })).toBe(LandingPerformanceError.None);
    expect(error({ weight: 42_400 })).toBe(LandingPerformanceError.OperatingEmptyWeight);
    expect(error({ weight: 79_000 })).toBe(LandingPerformanceError.None);
    expect(error({ weight: 79_100 })).toBe(LandingPerformanceError.MaximumTakeoffWeight);
    expect(error({ elevation: 9200, oat: -3 })).toBe(LandingPerformanceError.None);
    expect(error({ elevation: 9300, oat: -3 })).toBe(LandingPerformanceError.MaximumPressureAlt);
    expect(error({ headwind: -15 })).toBe(LandingPerformanceError.None);
    expect(error({ headwind: -16 })).toBe(LandingPerformanceError.MaximumTailwind);
    expect(error({ slope: -2 })).toBe(LandingPerformanceError.None);
    expect(error({ slope: 2.1 })).toBe(LandingPerformanceError.MaximumRunwaySlope);
    expect(error({ oat: NaN })).toBe(LandingPerformanceError.InvalidData);
  });

  it('allows 29 kt of crosswind on compacted snow at or below -15 °C, 25 kt above (PER-LDG-DIS-MAT)', () => {
    expect(calculator.crosswindLimit(LandingRunwayCondition.CompactedSnow, -15)).toBe(29);
    expect(calculator.crosswindLimit(LandingRunwayCondition.CompactedSnow, -14)).toBe(25);
    expect(calculator.crosswindLimit(LandingRunwayCondition.WetGrooved, 15)).toBe(38);
    expect(calculator.crosswindLimit(LandingRunwayCondition.StandingWater, 15)).toBe(20);
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
