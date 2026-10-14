// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { TIRE_COUNT } from '@shared/TirePressures';
import {
  isWheelTirePressLo,
  WHEEL_TIRE_PRESS_LO_ALERT,
  WHEEL_TIRE_PRESS_LO_LEVEL,
  WHEEL_TIRE_PRESS_LO_PHASE_INHIBITION,
} from './TirePressureAlerts';

/** The TPIS measurement of the normal 217.5 PSI */
const normal = () => new Array<number>(TIRE_COUNT).fill(220);

/* A380 FCOM PRO-ABN-ECAM-10-32 WHEEL TIRE PRESS LO, a380_fcom.txt l.163270-163311 (FCOM audit T2-44, row B27) */
describe('WHEEL TIRE PRESS LO', () => {
  it('no alert with the normal pressures', () => {
    expect(isWheelTirePressLo(normal(), 1)).toBe(false);
    expect(isWheelTirePressLo(normal(), 8)).toBe(false);
  });

  it('a tire below 89 % of 217.5 PSI in flight phases 1 to 5, below 74 % in phases 6 to 11', () => {
    const pressures = normal();
    pressures[6] = 190; // tire 7
    pressures[7] = 190; // its axle mate: the same pressure, no difference
    expect(isWheelTirePressLo(pressures, 2)).toBe(true);
    // 190 PSI is above the 161 PSI minimum of the flight phases
    expect(isWheelTirePressLo(pressures, 8)).toBe(false);
    pressures[6] = 155;
    pressures[7] = 155;
    expect(isWheelTirePressLo(pressures, 8)).toBe(true);
  });

  it('two tires of the same axle too different', () => {
    // the nose tires 35 PSI apart, both above the minimum: more than 15 % of 217.5 PSI on ground, less than 21 % in flight
    const pressures = normal();
    pressures[20] = 195;
    pressures[21] = 230;
    expect(isWheelTirePressLo(pressures, 1)).toBe(true);
    expect(isWheelTirePressLo(pressures, 8)).toBe(false);
  });

  it('no alert before the first TPIS data (all pressures at 0)', () => {
    expect(isWheelTirePressLo(new Array<number>(TIRE_COUNT).fill(0), 1)).toBe(false);
  });

  it('single chime, MASTER CAUT, phases 3 to 7 and 10 inhibited (PDF page 5539)', () => {
    expect(WHEEL_TIRE_PRESS_LO_ALERT).toBe(320800063);
    expect(WHEEL_TIRE_PRESS_LO_LEVEL).toBe(2);
    expect(WHEEL_TIRE_PRESS_LO_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 10]);
  });

  it('is wired in FwsCore and FwsAbnormalSensed, with the WHEEL SD page', () => {
    const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
    const abnormal = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8').replace(/\r\n/g, '\n');
    expect(core).toContain('this.wheelTirePressLo.set(');
    const start = abnormal.indexOf('    [WHEEL_TIRE_PRESS_LO_ALERT]: {');
    expect(start).toBeGreaterThan(0);
    const entry = abnormal.slice(start, abnormal.indexOf('\n    },', start));
    expect(entry).toContain('simVarIsActive: this.fws.wheelTirePressLo,');
    expect(entry).toContain('sysPage: SdPages.Wheel,');
  });
});
