// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { LineupAngle, RunwayCondition, TakeoffAntiIceSetting, TakeoffPerfomanceError } from '@flybywiresim/fbw-sdk';
import { A320251NTakeoffPerformanceCalculator } from './a32nx_takeoff';

const calculator = new A320251NTakeoffPerformanceCalculator();

interface Inputs {
  tow: number;
  conf: number;
  tora: number;
  lineupAngle: LineupAngle;
  wind: number;
  elevation: number;
  oat: number;
  forceToga: boolean;
}

/** Sea level, ISA, dry runway, no wind and no slope */
const DEFAULTS: Inputs = {
  tow: 70_000,
  conf: 2,
  tora: 2500,
  lineupAngle: 0,
  wind: 0,
  elevation: 0,
  oat: 15,
  forceToga: false,
};

const calculate = (overrides: Partial<Inputs> = {}) => {
  const i = { ...DEFAULTS, ...overrides };
  return calculator.calculateTakeoffPerformance(
    i.tow,
    false,
    i.conf,
    i.tora,
    0,
    i.lineupAngle,
    i.wind,
    i.elevation,
    1013.25,
    i.oat,
    TakeoffAntiIceSetting.Off,
    true,
    i.forceToga,
    RunwayCondition.Dry,
  );
};

describe('A320251NTakeoffPerformanceCalculator runway distances', () => {
  it('gives the shortest runway on which the takeoff is still possible at TOGA', () => {
    const result = calculate({ tow: 76_000 });
    const distances = calculator.calculateTakeoffDistances(result, undefined)!;

    expect(distances.available).toBe(2500);
    expect(distances.required).toBeDefined();
    expect(distances.required!).toBeLessThanOrEqual(distances.available);
    expect(calculate({ tow: 76_000, tora: distances.required! }).error).toBe(TakeoffPerfomanceError.None);
    expect(calculate({ tow: 76_000, tora: distances.required! - 5 }).error).not.toBe(TakeoffPerfomanceError.None);
    expect(distances.requiredBelowData).toBe(false);
    expect(distances.shortestDataLength).toBe(1000);
  });

  it('needs more runway at a higher weight and at a FLEX temperature', () => {
    const light = calculator.calculateTakeoffDistances(calculate({ tow: 66_000, tora: 3000 }), undefined)!;
    const heavyResult = calculate({ tow: 78_000, tora: 3000 });
    const heavy = calculator.calculateTakeoffDistances(heavyResult, undefined)!;
    const flex = calculator.calculateTakeoffDistances(heavyResult, heavyResult.flex)!;

    expect(heavy.required!).toBeGreaterThan(light.required!);
    expect(flex.flex).toBe(heavyResult.flex);
    expect(flex.required!).toBeGreaterThan(heavy.required!);
    expect(flex.required!).toBeLessThanOrEqual(flex.available);
  });

  it('keeps the FLEX temperature on the required runway', () => {
    const result = calculate({ tow: 78_000, tora: 3000 });
    const distances = calculator.calculateTakeoffDistances(result, result.flex)!;

    const onRequired = calculate({ tow: 78_000, tora: distances.required! });
    expect(onRequired.flex!).toBeGreaterThanOrEqual(result.flex!);
    const shorter = calculate({ tow: 78_000, tora: distances.required! - 5 });
    expect(shorter.error !== TakeoffPerfomanceError.None || shorter.flex! < result.flex!).toBe(true);
  });

  it('does not count the line-up distance in the available length', () => {
    const straight = calculator.calculateTakeoffDistances(calculate({ tow: 76_000 }), undefined)!;
    const turned = calculator.calculateTakeoffDistances(calculate({ tow: 76_000, lineupAngle: 180 }), undefined)!;

    expect(turned.available).toBeCloseTo(2500 - 41, 6);
    expect(Math.abs(turned.required! - straight.required!)).toBeLessThanOrEqual(2);
  });

  it('gives no distances for a FLEX temperature outside the possible range', () => {
    const result = calculate({ tow: 70_000, tora: 3000 });

    expect(result.flex).toBeDefined();
    expect(calculator.calculateTakeoffDistances(result, result.flex! + 1)).toBeUndefined();
    // the flat rating temperature (44 °C at sea level) is the lowest FLEX temperature, also above the OAT
    expect(result.params.tRef).toBe(44);
    expect(calculator.calculateTakeoffDistances(result, 43)).toBeUndefined();
    expect(calculator.calculateTakeoffDistances(result, 44)!.required).toBeDefined();
  });

  it('gives the distances of a forced TOGA takeoff, but none for a FLEX temperature', () => {
    const result = calculate({ tow: 70_000, tora: 3000, forceToga: true });

    expect(result.flex).toBeUndefined();
    const distances = calculator.calculateTakeoffDistances(result, undefined)!;
    expect(distances.required!).toBeLessThan(distances.available);
    expect(calculator.calculateTakeoffDistances(result, 50)).toBeUndefined();
  });

  it('gives no distances for a takeoff that is not possible', () => {
    const result = calculate({ tow: 79_000, tora: 1200, forceToga: true });

    expect(result.error).not.toBe(TakeoffPerfomanceError.None);
    expect(calculator.calculateTakeoffDistances(result, undefined)).toBeUndefined();
  });

  it('says when the takeoff is possible on the shortest runway of the tables', () => {
    // light, CONF 3, 20 kt of headwind: about 45 t needs 1047 m at CONF 2 without wind
    const distances = calculator.calculateTakeoffDistances(calculate({ tow: 45_000, conf: 3, wind: 20 }), undefined)!;

    expect(distances.requiredBelowData).toBe(true);
    expect(distances.required).toBeUndefined();
  });
});
