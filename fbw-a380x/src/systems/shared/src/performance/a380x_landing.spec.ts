// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  LandingAntiIce,
  LandingApproachType,
  LandingBrakingMode,
  LandingComputationType,
  LandingConf,
  LandingGoAroundConf,
  LandingLimitation,
  LandingPerformanceError,
  LandingPerformanceEstimate,
  LandingPerformanceInputs,
  LandingRunwayCondition,
} from '@flybywiresim/fbw-sdk';
import { A380842LandingPerformanceCalculator } from './a380x_landing';

const calculator = new A380842LandingPerformanceCalculator();

/** DISPATCH at sea level, ISA, dry, CONF FULL, VAPP = VLS, no wind: the conditions of the Airbus chart */
const CHART: LandingPerformanceInputs = {
  type: LandingComputationType.Dispatch,
  weight: 380_000,
  conf: LandingConf.Full,
  lda: 4000,
  elevation: 0,
  slope: 0,
  headwind: 0,
  crosswind: 0,
  oat: 15,
  qnh: 1013.25,
  runwayCondition: LandingRunwayCondition.Dry,
  antiIce: LandingAntiIce.Off,
  airConditioning: true,
  approachType: LandingApproachType.Normal,
  goAroundGradient: 2.7,
  speedIncrement: 0,
  autoland: false,
  glideSlope: 3,
  brakingMode: LandingBrakingMode.Manual,
  reverseThrust: false,
  overweightProcedure: false,
};

/**
 * The A380 FCOM example of in-flight results (PER-LND-LDI P 3, PER-LND-LRF-FSR P 2): AIRBUS TRAINING, RWY 06, ELEVN
 * 820 ft, LENGTH 13163 ft, GA ALTITUDE 1320 ft, wind 080/15 (HD14 R5), OAT 15 °C, QNH 1013, dry, LW 851.0 klb, CONF FULL,
 * air conditioning on, normal approach, GA gradient 2.7, VLS+ 5, manual landing and braking.
 * Results: MLW(perf) 1254.4 klb, WGT, FLAPS FULL, GA SPEED 141 kt, GA GRADIENT 8.939 %, VAPP VLS+5.
 */
const FCOM_EXAMPLE: LandingPerformanceInputs = {
  ...CHART,
  type: LandingComputationType.InFlight,
  weight: 851_000 * 0.45359237,
  lda: 13163 / 3.28084,
  elevation: 820,
  goAroundAltitude: 1320,
  headwind: 14,
  crosswind: 5,
  qnh: 1013,
  speedIncrement: 5,
};

describe('A380 landing performance', () => {
  it('gives the landing field length of the Airbus chart', () => {
    // FIGURE-3-4-1-991-001-A01: 380 t at sea level 1878 m, at 4000 ft 2063 m
    expect(calculator.calculateLandingPerformance(CHART).landingDistance).toBeCloseTo(1878, 0);
    const high = calculator.calculateLandingPerformance({ ...CHART, elevation: 4000 });
    expect(high.landingDistance).toBeCloseTo(2063, 0);
    expect(high.estimates).not.toContain(LandingPerformanceEstimate.LandingDistance);
    expect(high.actualLandingDistance).toBeCloseTo(2063 * 0.6, 0);
  });

  it('reproduces the FCOM example of in-flight results', () => {
    const result = calculator.calculateLandingPerformance(FCOM_EXAMPLE);
    expect(result.error).toBe(LandingPerformanceError.None);
    expect(result.conf).toBe(LandingConf.Full);
    expect(result.goAroundConf).toBe(LandingGoAroundConf.Conf3);
    expect(result.goAroundGradient).toBeCloseTo(8.939, 1);
    expect(result.goAroundSpeed).toBeCloseTo(141, 0);
    expect(result.mlwPerf / 1000).toBeCloseTo(569, 0);
    expect(result.limitation).toBe(LandingLimitation.Weight);
    expect(result.vapp).toBe(result.vls + 5);
    expect(result.stopMargin).toBe(FCOM_EXAMPLE.lda - result.landingDistance);
    expect(result.overweight).toBe(false);
  });

  it('applies the regulatory factors of the dispatch computation', () => {
    const dry = calculator.calculateLandingPerformance(CHART).landingDistance;
    const wet = calculator.calculateLandingPerformance({ ...CHART, runwayCondition: LandingRunwayCondition.Wet });
    expect(wet.landingDistance).toBeCloseTo(dry * 1.15, 0);
    const slush = calculator.calculateLandingPerformance({
      ...CHART,
      runwayCondition: LandingRunwayCondition.Slush6mm,
    });
    expect(slush.landingDistance).toBeGreaterThanOrEqual(wet.landingDistance);

    // 50 % of the headwind, 150 % of the tailwind
    const headwind = calculator.calculateLandingPerformance({ ...CHART, headwind: 10 }).landingDistance;
    const tailwind = calculator.calculateLandingPerformance({ ...CHART, headwind: -10 }).landingDistance;
    expect(dry - headwind).toBeLessThan(tailwind - dry);
    expect(headwind).toBeLessThan(dry);
  });

  it('orders the autobrake modes and uses the friction of the runway', () => {
    const result = calculator.calculateLandingPerformance({ ...CHART, type: LandingComputationType.InFlight });
    const distance = (mode: LandingBrakingMode) => result.brakingDistances.find((d) => d.mode === mode).distance;
    expect(distance(LandingBrakingMode.Lo)).toBeGreaterThan(distance(LandingBrakingMode.Two));
    expect(distance(LandingBrakingMode.Two)).toBeGreaterThan(distance(LandingBrakingMode.Three));
    expect(distance(LandingBrakingMode.Three)).toBeGreaterThan(distance(LandingBrakingMode.Hi));
    expect(distance(LandingBrakingMode.Hi)).toBeGreaterThanOrEqual(distance(LandingBrakingMode.Manual));

    const icy = calculator.calculateLandingPerformance({
      ...CHART,
      type: LandingComputationType.InFlight,
      runwayCondition: LandingRunwayCondition.Icy,
    });
    expect(icy.actualLandingDistance).toBeGreaterThan(2 * result.actualLandingDistance);
    const reversers = calculator.calculateLandingPerformance({
      ...CHART,
      type: LandingComputationType.InFlight,
      runwayCondition: LandingRunwayCondition.Icy,
      reverseThrust: true,
    });
    expect(reversers.actualLandingDistance).toBeLessThan(icy.actualLandingDistance);
    expect(reversers.reverseCredit).toBe(true);
  });

  it('lands in CONF 3 with AUTO CONF when the go-around gradient in CONF 3 is not enough', () => {
    const normal = calculator.calculateLandingPerformance({ ...CHART, conf: LandingConf.Auto });
    expect(normal.conf).toBe(LandingConf.Full);

    // High, ISA + 15, overweight: the go-around in CONF 3 is below 2.7 %, the one in CONF 2 above
    const high = calculator.calculateLandingPerformance({
      ...CHART,
      type: LandingComputationType.InFlight,
      conf: LandingConf.Auto,
      weight: 508_000,
      elevation: 6000,
      oat: 18,
      lda: 5000,
    });
    expect(high.overweight).toBe(true);
    expect(high.conf).toBe(LandingConf.Conf3);
    expect(high.goAroundConf).toBe(LandingGoAroundConf.Conf2);
    expect(high.goAroundGradient).toBeGreaterThanOrEqual(2.7);
    const full = calculator.calculateLandingPerformance({
      ...CHART,
      type: LandingComputationType.InFlight,
      weight: 508_000,
      elevation: 6000,
      oat: 18,
      lda: 5000,
    });
    expect(full.goAroundGradient).toBeLessThan(2.7);
    expect(full.limitation).toBe(LandingLimitation.ApproachClimb);
  });

  it('gives the BTV DRY and WET lines of the approach speed and the wind', () => {
    const result = calculator.calculateLandingPerformance({ ...CHART, speedIncrement: 5 });
    // Sea level ISA: touchdown ground speed = VAPP; 400 m + 5 s of roll + V² / (2 x 2.8) or (2 x 1.8)
    const v = result.vapp * 0.514444;
    expect(result.btv.dry).toBeCloseTo(400 + 5 * v + v ** 2 / 5.6, 0);
    expect(result.btv.wet).toBeCloseTo(400 + 5 * v + v ** 2 / 3.6, 0);
    const headwind = calculator.calculateLandingPerformance({ ...CHART, speedIncrement: 5, headwind: 20 });
    expect(headwind.btv.dry).toBeLessThan(result.btv.dry);
  });

  it('checks the limits', () => {
    expect(calculator.calculateLandingPerformance({ ...CHART, weight: 395_001 }).error).toBe(
      LandingPerformanceError.MaximumLandingWeight,
    );
    expect(
      calculator.calculateLandingPerformance({ ...CHART, type: LandingComputationType.InFlight, weight: 450_000 })
        .error,
    ).toBe(LandingPerformanceError.None);
    expect(calculator.calculateLandingPerformance({ ...CHART, headwind: -11 }).error).toBe(
      LandingPerformanceError.MaximumTailwind,
    );
    expect(calculator.calculateLandingPerformance({ ...CHART, elevation: 9000 }).error).toBe(
      LandingPerformanceError.MaximumPressureAlt,
    );
  });

  it('limits the MLW(PERF) by the runway length', () => {
    const result = calculator.calculateLandingPerformance({ ...CHART, lda: 2000 });
    expect(result.limitation).toBe(LandingLimitation.Weight);
    const short = calculator.calculateLandingPerformance({ ...CHART, lda: 1800 });
    expect(short.limitation).toBe(LandingLimitation.Lda);
    expect(short.mlwPerf).toBeLessThan(CHART.weight);
    // 1803 m is the chart distance of 360 t at sea level
    expect(calculator.calculateLandingPerformance({ ...CHART, lda: 1803 }).mlwPerf / 1000).toBeCloseTo(360, 0);
  });
});

describe('A380 in-flight landing with BTV (FCOM DSC-32-20-220)', () => {
  const inFlight = { ...CHART, type: LandingComputationType.InFlight };

  it('lands at the DRY line on a dry runway and at the WET line on a wet one', () => {
    const dry = calculator.calculateLandingPerformance({ ...inFlight, brakingMode: LandingBrakingMode.Btv });
    expect(dry.error).toBe(LandingPerformanceError.None);
    expect(dry.actualLandingDistance).toBeCloseTo(dry.btv.dry, 3);

    const wet = calculator.calculateLandingPerformance({
      ...inFlight,
      runwayCondition: LandingRunwayCondition.Wet,
      brakingMode: LandingBrakingMode.Btv,
    });
    expect(wet.actualLandingDistance).toBeCloseTo(wet.btv.wet, 3);
    expect(wet.actualLandingDistance).toBeGreaterThan(dry.actualLandingDistance);
  });

  it('lists BTV with the autobrake modes on dry and wet runways only', () => {
    const modes = (condition: LandingRunwayCondition) =>
      calculator
        .calculateLandingPerformance({ ...inFlight, runwayCondition: condition })
        .brakingDistances.map((d) => d.mode);
    expect(modes(LandingRunwayCondition.Dry)).toContain(LandingBrakingMode.Btv);
    expect(modes(LandingRunwayCondition.CompactedSnow)).not.toContain(LandingBrakingMode.Btv);
  });

  it('rejects BTV on a contaminated runway', () => {
    const result = calculator.calculateLandingPerformance({
      ...inFlight,
      runwayCondition: LandingRunwayCondition.CompactedSnow,
      brakingMode: LandingBrakingMode.Btv,
    });
    expect(result.error).toBe(LandingPerformanceError.BtvRunwayCondition);
  });
});
