// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  axleMate,
  isTirePressureAbnormal,
  TIRE_COUNT,
  TIRE_NORMAL_PRESSURE_PSI,
  tirePressureVar,
  tpisMeasurement,
} from './TirePressures';

const normal = () => new Array(TIRE_COUNT).fill(220);

describe('A380 TPIS tire pressures', () => {
  it('measures from 0 to 400 PSI by 5 PSI steps; the normal 217.5 PSI reads 220', () => {
    expect(tpisMeasurement(TIRE_NORMAL_PRESSURE_PSI)).toBe(220);
    expect(tpisMeasurement(193.2)).toBe(195);
    expect(tpisMeasurement(-3)).toBe(0);
    expect(tpisMeasurement(450)).toBe(400);
  });

  it('pairs the two tires of each axle, nose tires 21 and 22 included', () => {
    expect([1, 2, 19, 20, 21, 22].map(axleMate)).toEqual([2, 1, 20, 19, 22, 21]);
    expect(tirePressureVar(21)).toBe('L:A380X_TPIS_TIRE_21_PRESSURE');
  });

  it('low below 89 % of 217.5 PSI in flight phases 1 to 5 (WHEEL TIRE PRESS LO)', () => {
    const pressures = normal();
    pressures[4] = 190; // tire 5, below 193.6 PSI
    pressures[5] = 190; // its axle mate, same pressure: no difference
    expect(isTirePressureAbnormal(pressures, 5, 1)).toBe(true);
    pressures[4] = 195;
    pressures[5] = 195;
    expect(isTirePressureAbnormal(pressures, 5, 5)).toBe(false);
  });

  it('low below 74 % of 217.5 PSI in flight phases 6 to 11', () => {
    const pressures = normal();
    pressures[0] = 165;
    pressures[1] = 165;
    expect(isTirePressureAbnormal(pressures, 1, 8)).toBe(false);
    pressures[0] = 160;
    pressures[1] = 160;
    expect(isTirePressureAbnormal(pressures, 1, 8)).toBe(true);
    expect(isTirePressureAbnormal(pressures, 1, 12)).toBe(true);
  });

  it('abnormal when the two tires of an axle differ by 15 % (phases 1-5) or 21 % (6-11)', () => {
    const pressures = normal();
    // nose tires: 35 PSI apart, both above the minimum (more than 32.6 PSI, less than 45.7 PSI)
    pressures[20] = 195;
    pressures[21] = 230;
    expect(isTirePressureAbnormal(pressures, 21, 1)).toBe(true);
    expect(isTirePressureAbnormal(pressures, 22, 1)).toBe(true);
    expect(isTirePressureAbnormal(pressures, 22, 7)).toBe(false);
    expect(isTirePressureAbnormal(pressures, 3, 1)).toBe(false);
  });
});
