// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320AircraftConfig, A320EconParameters } from '@fmgc/flightplanning/A320AircraftConfig';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import { FlightModel } from '../FlightModel';
import { tonnesToPounds } from '../EconSpeeds';
import { FlapConf } from '../common';
import { EngineOutPerformance, limitCruiseAltitude } from './EngineOutPerformance';

const a320 = (tonnes: number) =>
  new EngineOutPerformance({
    config: A320AircraftConfig,
    econ: A320EconParameters,
    greenDotSpeedAt: (altitude) => FlightModel.getGreenDotSpeedCas(altitude, tonnes * 1000),
    lrcCostIndex: null,
    windmillingDragFraction: 0.4,
  });

const conditions = (tonnes: number, isaDeviation = 0) => ({
  altitude: 0,
  weight: tonnesToPounds(tonnes),
  isaDeviation,
  headwind: 0,
  tropopause: 36_090,
});

describe('EngineOutPerformance', () => {
  it('removes the failed engine and adds its windmilling drag', () => {
    const performance = a320(65);
    expect(performance.config.engineModelParameters.numberOfEngines).toBe(1);
    const nominalDrag = A320AircraftConfig.flightModelParameters.dragPolarCoefficients[FlapConf.CLEAN][0];
    expect(performance.config.flightModelParameters.dragPolarCoefficients[FlapConf.CLEAN][0]).toBeGreaterThan(
      nominalDrag,
    );
    expect(A320AircraftConfig.engineModelParameters.numberOfEngines).toBe(2);
  });

  it('keeps the A380 failed engine count between one and three', () => {
    expect(EngineOutPerformance.failedEngineCount(A380AircraftConfig, 3)).toBe(1);
    expect(EngineOutPerformance.failedEngineCount(A380AircraftConfig, 2)).toBe(2);
    expect(EngineOutPerformance.failedEngineCount(A380AircraftConfig, 4)).toBe(1);
    expect(EngineOutPerformance.failedEngineCount(A380AircraftConfig, 0)).toBe(3);
  });

  it('gives the A320 long range ceilings of the FCOM within 1500 ft', () => {
    expect(Math.abs(a320(62).maximumAltitude(conditions(62)) - 20_300)).toBeLessThan(1_500);
    expect(Math.abs(a320(70).maximumAltitude(conditions(70)) - 18_200)).toBeLessThan(1_500);
  });

  it('has a lower ceiling when heavier or warmer', () => {
    expect(a320(70).maximumAltitude(conditions(70))).toBeLessThan(a320(62).maximumAltitude(conditions(62)));
    expect(a320(65).maximumAltitude(conditions(65, 15))).toBeLessThan(a320(65).maximumAltitude(conditions(65, 0)));
  });

  it('holds the green dot speed higher than the long range speed', () => {
    const performance = a320(65);
    const driftDown = performance.driftDownAltitude(conditions(65));
    expect(driftDown).toBeGreaterThan(performance.maximumAltitude(conditions(65)));
    const profile = performance.profileParameters(conditions(65));
    expect(profile.driftDownAltitude).toBe(driftDown);
    expect(profile.maximumAltitude).toBe(performance.maximumAltitude(conditions(65)));
  });

  it('never gives a drift down altitude below an EO MAX of its own', () => {
    const profile = a320(65).profileParameters(conditions(65), 40_000);
    expect(profile.maximumAltitude).toBe(40_000);
    expect(profile.driftDownAltitude).toBe(40_000);
  });

  it('limits the cruise Mach to what the remaining engine holds', () => {
    const performance = a320(65);
    const c = conditions(65);
    const aboveCeiling = performance.maximumAltitude(c) + 1_500;
    const strategyMach = performance.longRangeMach(aboveCeiling, c, 'lrc');
    const mach = performance.cruiseMach(aboveCeiling, c, 'lrc');
    expect(mach).toBeLessThan(strategyMach);
    expect(mach).toBeGreaterThanOrEqual(performance.greenDotMach(aboveCeiling, c));
    expect(performance.cruiseMach(15_000, c, 'lrc')).toBeCloseTo(performance.longRangeMach(15_000, c, 'lrc'), 3);
  });

  it('flies a higher EO-ECON Mach for a higher cost index', () => {
    const performance = a320(65);
    const c = conditions(65);
    expect(performance.longRangeMach(15_000, c, 'econ', 100)).toBeGreaterThan(
      performance.longRangeMach(15_000, c, 'econ', 0),
    );
  });

  it('limits the cruise level to EO MAX only with an engine out', () => {
    const profile = a320(65).profileParameters(conditions(65));
    expect(limitCruiseAltitude(35_000, profile)).toBe(profile.maximumAltitude);
    expect(limitCruiseAltitude(10_000, profile)).toBe(10_000);
    expect(limitCruiseAltitude(35_000, null)).toBe(35_000);
  });
});
