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
  LandingPerformanceInputs,
  LandingRunwayCondition,
} from '@flybywiresim/fbw-sdk';
import { A380842LandingPerformanceCalculator } from '@shared/performance/a380x_landing';
import { PerformanceRunway } from './PerformanceRunways';
import {
  LandingConditions,
  computeLandingPerformance,
  landingGoAroundConfShown,
  missingLandingParameters,
  parseGoAroundGradientEntry,
} from './LandingPerformance';

const calculator = new A380842LandingPerformanceCalculator();

const RUNWAY: PerformanceRunway = {
  ident: '06',
  magneticBearing: 60,
  takeoffLength: 4000,
  landingLength: 3800,
  elevation: 820,
  slope: 0,
};

/** IN-FLIGHT, 080/15 (14 kt of headwind on 06), 15 °C, 1013, dry, 380 t, CONF FULL, the standard options */
const CONDITIONS: LandingConditions = {
  computation: 0,
  wind: { kind: 'direction', direction: 80, speed: 15, gust: null },
  oat: 15,
  qnh: 1013,
  runwayCondition: 0,
  antiIce: 0,
  lw: 380_000,
  conf: 0,
  goAroundConf: 0,
  airCond: 0,
  approachType: 0,
  goAroundGradient: null,
  speedIncrement: null,
  technique: 0,
  glideSlope: null,
  braking: 0,
};

/** The calculator inputs of CONDITIONS */
const INPUTS: LandingPerformanceInputs = {
  type: LandingComputationType.InFlight,
  weight: 380_000,
  conf: LandingConf.Full,
  goAroundConf: undefined,
  lda: 3800,
  elevation: 820,
  slope: 0,
  headwind: 15 * Math.cos((20 * Math.PI) / 180),
  crosswind: 15 * Math.sin((20 * Math.PI) / 180),
  oat: 15,
  qnh: 1013,
  runwayCondition: LandingRunwayCondition.Dry,
  antiIce: LandingAntiIce.Off,
  airConditioning: true,
  approachType: LandingApproachType.Normal,
  goAroundGradient: 2.7,
  speedIncrement: undefined,
  autoland: false,
  glideSlope: 3,
  brakingMode: LandingBrakingMode.Manual,
  reverseThrust: true,
  overweightProcedure: false,
};

describe('LDG PERF', () => {
  it('lists the missing parameters in the order of the panel', () => {
    expect(
      missingLandingParameters(
        { ...CONDITIONS, wind: null, oat: null, qnh: null, runwayCondition: null, antiIce: null, lw: null },
        null,
      ),
    ).toEqual(['WIND', 'OAT', 'QNH', 'RWY COND', 'A-ICE', 'LW', 'RWY']);
  });

  it('gives the results of the calculator for the CONDITIONS panel', () => {
    const expected = calculator.calculateLandingPerformance(INPUTS);
    const { results, errors } = computeLandingPerformance(calculator, CONDITIONS, RUNWAY);
    expect(errors).toEqual([]);
    expect(results).toEqual({
      runway: '06',
      lw: 380_000,
      mlwPerf: expected.mlwPerf,
      limitation: expected.limitation,
      flaps: LandingConf.Full,
      goAroundConf: LandingGoAroundConf.Conf3,
      landingDistance: expected.landingDistance,
      actualLandingDistance: expected.actualLandingDistance,
      runwayLength: 3800,
      stopMargin: expected.stopMargin,
      goAroundSpeed: expected.goAroundSpeed,
      goAroundGradient: expected.goAroundGradient,
      speedIncrement: 5,
      vapp: expected.vapp,
      overweight: false,
      reverseThrustCredit: false,
    });
    expect(results!.stopMargin).toBeCloseTo(3800 - results!.landingDistance!, 6);
  });

  it('computes DISPATCH with the manual braking whatever BRK MODE', () => {
    const dispatch = computeLandingPerformance(calculator, { ...CONDITIONS, computation: 1, braking: 4 }, RUNWAY);
    const expected = calculator.calculateLandingPerformance({ ...INPUTS, type: LandingComputationType.Dispatch });
    expect(dispatch.results?.landingDistance).toBe(expected.landingDistance);
  });

  it('takes the entered VLS+ and the go-around gradient', () => {
    const { results } = computeLandingPerformance(
      calculator,
      { ...CONDITIONS, speedIncrement: 10, goAroundGradient: 3.5 },
      RUNWAY,
    );
    const expected = calculator.calculateLandingPerformance({ ...INPUTS, speedIncrement: 10, goAroundGradient: 3.5 });
    expect(results?.speedIncrement).toBe(10);
    expect(results?.vapp).toBe(expected.vapp);
  });

  it('shows GA CONF for an IN-FLIGHT overweight landing only', () => {
    expect(landingGoAroundConfShown({ ...CONDITIONS, lw: 400_000 }, calculator.mlw)).toBe(true);
    expect(landingGoAroundConfShown({ ...CONDITIONS, lw: 380_000 }, calculator.mlw)).toBe(false);
    expect(landingGoAroundConfShown({ ...CONDITIONS, lw: 400_000, computation: 1 }, calculator.mlw)).toBe(false);
    const overweight = computeLandingPerformance(
      calculator,
      { ...CONDITIONS, lw: 420_000, conf: 1, goAroundConf: 1 },
      RUNWAY,
    );
    expect(overweight.results?.overweight).toBe(true);
    expect(overweight.results?.goAroundConf).toBe(LandingGoAroundConf.Conf1F);
  });

  it('refuses an overweight DISPATCH computation', () => {
    expect(
      computeLandingPerformance(calculator, { ...CONDITIONS, computation: 1, lw: 420_000 }, RUNWAY).errors,
    ).toEqual(['LW above MLW: overweight landing computed IN-FLIGHT only']);
  });

  it('takes MIN for the minimum go-around gradient', () => {
    expect(parseGoAroundGradientEntry('MIN', 2.7)).toBeNull();
    expect(parseGoAroundGradientEntry('3.5', 2.7)).toBe(3.5);
    expect(parseGoAroundGradientEntry('2.5', 2.7)).toBeUndefined();
    expect(parseGoAroundGradientEntry('X', 2.7)).toBeUndefined();
  });
});
