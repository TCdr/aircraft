// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320AircraftConfig, A320EconParameters } from '@fmgc/flightplanning/A320AircraftConfig';
import { FlightModel } from '../FlightModel';
import { tonnesToPounds } from '../EconSpeeds';
import { VerticalCheckpointReason } from '../profile/NavGeometryProfile';
import { computeDriftDownPath, MINIMUM_DRIFT_DOWN_DESCENT_RATE } from './DriftDownPath';
import { EngineOutPerformance } from './EngineOutPerformance';

const grossWeightTonnes = 65;
const performance = new EngineOutPerformance({
  config: A320AircraftConfig,
  econ: A320EconParameters,
  greenDotSpeedAt: (altitude) => FlightModel.getGreenDotSpeedCas(altitude, grossWeightTonnes * 1000),
  lrcCostIndex: null,
  windmillingDragFraction: 0.4,
});
const conditions = {
  altitude: 0,
  weight: tonnesToPounds(grossWeightTonnes),
  isaDeviation: 0,
  headwind: 0,
  tropopause: 36_090,
};
const limits = performance.profileParameters(conditions);

const drift = (startAltitude: number) =>
  computeDriftDownPath({
    config: performance.config,
    startAltitude,
    startSpeed: 280,
    levelOffAltitude: limits.maximumAltitude,
    driftDownAltitude: limits.driftDownAltitude,
    greenDotSpeedAt: (altitude) => performance.greenDotSpeedAt(altitude),
    cruiseMach: 0.78,
    cruiseSpeed: 230,
    zeroFuelWeight: tonnesToPounds(55),
    fuelOnBoard: tonnesToPounds(10),
    headwind: 0,
    isaDeviation: 0,
    tropopause: 36_090,
  });

describe('computeDriftDownPath', () => {
  it('predicts nothing at or below the level-off altitude', () => {
    expect(drift(limits.maximumAltitude)).toEqual([]);
    expect(drift(limits.maximumAltitude - 3_000)).toEqual([]);
  });

  it('drifts down from FL350 to EO MAX, marking the drift down altitude on the way', () => {
    const points = drift(35_000);
    const last = points[points.length - 1];
    expect(last.reason).toBe(VerticalCheckpointReason.DriftDownLevelOff);
    expect(last.altitude).toBeCloseTo(limits.maximumAltitude, -1);
    expect(last.speed).toBe(230);

    const marker = points.filter((p) => p.reason === VerticalCheckpointReason.DriftDown);
    expect(marker).toHaveLength(1);
    expect(marker[0].altitude).toBeCloseTo(limits.driftDownAltitude, -1);

    for (let i = 1; i < points.length; i++) {
      expect(points[i].distance).toBeGreaterThanOrEqual(points[i - 1].distance);
      expect(points[i].seconds).toBeGreaterThanOrEqual(points[i - 1].seconds);
      expect(points[i].altitude).toBeLessThanOrEqual(points[i - 1].altitude + 1);
      expect(points[i].fuelBurned).toBeGreaterThanOrEqual(points[i - 1].fuelBurned);
    }
  });

  it('descends no slower than 100 ft/min between the drift down altitude and EO MAX', () => {
    const points = drift(limits.driftDownAltitude);
    const feet = limits.driftDownAltitude - limits.maximumAltitude;
    const descentSeconds = points[points.length - 1].seconds;
    // The acceleration at the level-off is on top of the descent time
    expect(descentSeconds).toBeGreaterThan(0);
    expect(feet / (descentSeconds / 60)).toBeLessThanOrEqual(MINIMUM_DRIFT_DOWN_DESCENT_RATE * 1.2);
  });

  it('takes longer from a higher altitude', () => {
    const high = drift(39_000);
    const low = drift(30_000);
    expect(high[high.length - 1].seconds).toBeGreaterThan(low[low.length - 1].seconds);
  });
});
