// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { fuelVersusPlanKg, navlogFuelPlan, plannedFuelOnBoard } from './fuelPlan';

const PLAN = [
  { secondsAfterTakeoff: 600, fuelOnBoard: 8000 },
  { secondsAfterTakeoff: 1800, fuelOnBoard: 6800 },
  { secondsAfterTakeoff: 3600, fuelOnBoard: 5000 },
];
const kg = (value: number) => value;
const TAKEOFF = 1_000_000;

describe('navlogFuelPlan', () => {
  it('keeps the fixes with a time and a planned fuel', () => {
    expect(
      navlogFuelPlan([
        { time_total: '600', fuel_plan_onboard: '8000' },
        { time_total: '', fuel_plan_onboard: '7000' },
        { time_total: '1800', fuel_plan_onboard: '6800' },
      ]),
    ).toEqual([PLAN[0], PLAN[1]]);
    expect(navlogFuelPlan(undefined)).toEqual([]);
  });
});

describe('plannedFuelOnBoard', () => {
  it('interpolates between the fixes', () => {
    expect(plannedFuelOnBoard(PLAN, 1200)).toBe(7400);
  });

  it('holds the nearest fix outside the plan', () => {
    expect(plannedFuelOnBoard(PLAN, 0)).toBe(8000);
    expect(plannedFuelOnBoard(PLAN, 9000)).toBe(5000);
    expect(plannedFuelOnBoard([], 100)).toBeNull();
  });
});

describe('fuelVersusPlanKg', () => {
  it('is zero on the plan, positive above and negative below it', () => {
    expect(fuelVersusPlanKg(6800, PLAN, TAKEOFF, TAKEOFF + 1800, kg)).toBe(0);
    expect(fuelVersusPlanKg(7200, PLAN, TAKEOFF, TAKEOFF + 1800, kg)).toBe(400);
    expect(fuelVersusPlanKg(6500, PLAN, TAKEOFF, TAKEOFF + 1800, kg)).toBe(-300);
  });

  it('uses the last fix beyond the plan', () => {
    expect(fuelVersusPlanKg(4800, PLAN, TAKEOFF, TAKEOFF + 5000, kg)).toBe(-200);
  });

  it('converts the plan from the OFP unit', () => {
    expect(fuelVersusPlanKg(3500, PLAN, TAKEOFF, TAKEOFF + 3600, (lb) => lb / 2)).toBe(1000);
  });

  it('is null before takeoff or without a plan', () => {
    expect(fuelVersusPlanKg(6800, PLAN, null, TAKEOFF, kg)).toBeNull();
    expect(fuelVersusPlanKg(6800, [], TAKEOFF, TAKEOFF + 60, kg)).toBeNull();
  });
});
