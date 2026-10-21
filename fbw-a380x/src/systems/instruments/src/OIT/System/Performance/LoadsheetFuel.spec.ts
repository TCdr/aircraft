// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { KG_PER_LB } from './PerformanceEntries';
import { LOADSHEET_FUEL_TANKS, TRIM_TANK_INDEX, armToPercentMac, percentMacToArm } from './Loadsheet';
import {
  FQMS_DEFAULT_REFUEL_ZF,
  GROUND_CG_TARGET,
  cgTargetingDistribution,
  grossWeightCg,
  groundTransferAdvice,
  groundTransferLines,
  refuelZfData,
  refuelZfFields,
  takeoffCgLimits,
  tankCapacities,
  wingRefuelDistribution,
} from './LoadsheetFuel';

const DENSITY = 0.785;
const CAPACITIES = tankCapacities(DENSITY);
const sum = (values: readonly number[]) => values.reduce((total, v) => total + v, 0);

describe('LOADSHEET fuel', () => {
  it('has the FQMS default refuel data of 621 704 lb at 36.5 %', () => {
    expect(FQMS_DEFAULT_REFUEL_ZF.zfw / KG_PER_LB).toBeCloseTo(621_704, 3);
    expect(FQMS_DEFAULT_REFUEL_ZF.zfcg).toBe(36.5);
  });

  it('shows the NEW SET OF DATA entries one by one, and uses the data of the button selected', () => {
    const loading = { zfw: 350_000, zfcg: 37 };
    expect(refuelZfFields('newSet', { zfw: 360_000, zfcg: null }, loading)).toEqual({ zfw: 360_000, zfcg: null });
    expect(refuelZfData('newSet', { zfw: 360_000, zfcg: null }, loading)).toBeNull();
    expect(refuelZfData('newSet', { zfw: 360_000, zfcg: 38 }, loading)).toEqual({ zfw: 360_000, zfcg: 38 });
    expect(refuelZfData('fqmsDefault', { zfw: null, zfcg: null }, loading)).toEqual(FQMS_DEFAULT_REFUEL_ZF);
    expect(refuelZfData('loadsheet', { zfw: 360_000, zfcg: 38 }, loading)).toEqual(loading);
    expect(refuelZfFields('loadsheet', { zfw: 360_000, zfcg: 38 }, null)).toEqual({ zfw: null, zfcg: null });
  });

  it('fills the feed tanks first, then the outer tanks, as the wing refuel table', () => {
    const feedsOnly = wingRefuelDistribution(39_700 * KG_PER_LB, CAPACITIES);
    expect(sum(feedsOnly)).toBeCloseTo(39_700 * KG_PER_LB, 6);
    expect(feedsOnly[1]).toBeCloseTo(feedsOnly[4], 6);
    expect(feedsOnly[0]).toBe(0);
    expect(feedsOnly[TRIM_TANK_INDEX]).toBe(0);

    // Half way between 39 700 and 57 300 lb the outer tanks hold half of their 8 800 lb
    const halfOuter = wingRefuelDistribution(48_500 * KG_PER_LB, CAPACITIES);
    const scale = 48_500 / (4 * 9_900 + 2 * 4_400);
    expect(halfOuter[0] / KG_PER_LB).toBeCloseTo(4_400 * scale, 3);
    expect(halfOuter[0]).toBeCloseTo(halfOuter[9], 6);
    expect(halfOuter[2]).toBe(0);
  });

  it('keeps the trim tank empty below the CG targeting minimum fuel', () => {
    const distribution = cgTargetingDistribution(40_000, FQMS_DEFAULT_REFUEL_ZF, DENSITY);
    expect(distribution[TRIM_TANK_INDEX]).toBe(0);
    expect(sum(distribution)).toBeCloseTo(40_000, 6);
  });

  it('puts the trim fuel that brings the gross weight CG onto the ground CG target', () => {
    const zeroFuel = { zfw: 330_000, zfcg: 36 };
    const distribution = cgTargetingDistribution(150_000, zeroFuel, DENSITY);
    expect(sum(distribution)).toBeCloseTo(150_000, 3);
    expect(distribution[TRIM_TANK_INDEX]).toBeGreaterThan(0);
    expect(grossWeightCg(zeroFuel, distribution)).toBeCloseTo(GROUND_CG_TARGET, 2);
  });

  it('gives more trim fuel for a forward ZFCG than for an aft one', () => {
    const forward = cgTargetingDistribution(150_000, { zfw: 330_000, zfcg: 32 }, DENSITY);
    const aft = cgTargetingDistribution(150_000, { zfw: 330_000, zfcg: 38 }, DENSITY);
    expect(forward[TRIM_TANK_INDEX]).toBeGreaterThan(aft[TRIM_TANK_INDEX]);
  });

  it('fills the trim tank to its capacity when the target is out of reach', () => {
    const distribution = cgTargetingDistribution(150_000, { zfw: 330_000, zfcg: 20 }, DENSITY);
    expect(distribution[TRIM_TANK_INDEX]).toBeCloseTo(CAPACITIES[TRIM_TANK_INDEX], 3);
  });

  it('finds the takeoff CG limits of an envelope check', () => {
    const limits = takeoffCgLimits(400_000, (cg) => cg >= 31.25 && cg <= 43);
    expect(limits?.forward).toBeCloseTo(31.25, 3);
    expect(limits?.aft).toBeCloseTo(43, 3);
    expect(takeoffCgLimits(400_000, () => false)).toBeNull();
  });

  it('gives the transfers that bring the TOCG onto its limit and the CG onto the refuel target', () => {
    const distribution = LOADSHEET_FUEL_TANKS.map(() => 0);
    distribution[3] = 20_000;
    distribution[6] = 20_000;
    distribution[TRIM_TANK_INDEX] = 5_000;
    const zeroFuel = { zfw: 330_000, zfcg: 30 };
    const tow = 375_000;
    const towCg = grossWeightCg(zeroFuel, distribution);
    const advice = groundTransferAdvice(zeroFuel, distribution, tow, towCg, { forward: 33, aft: 43 }, DENSITY);

    expect(advice.outOfLimits).toBe('FWD');
    expect(advice.limit).toBe(33);
    const toLimit = advice.toLimit!;
    expect(toLimit.transfer).toBeGreaterThan(0);
    expect(toLimit.trimTankQuantity).toBeCloseTo(5_000 + toLimit.transfer, 6);
    // The moment the transfer moves from the inner tanks to the trim tank puts the TOCG on the limit
    const arm = percentMacToArm(towCg);
    const movedArm =
      (tow * arm + toLimit.transfer * (LOADSHEET_FUEL_TANKS[TRIM_TANK_INDEX].arm - LOADSHEET_FUEL_TANKS[3].arm)) / tow;
    expect(armToPercentMac(movedArm)).toBeCloseTo(33, 6);
    expect(toLimit.achievable).toBe(true);

    expect(advice.toTarget.transfer).toBeGreaterThan(toLimit.transfer);
    expect(advice.optimizedTowCg).toBeGreaterThan(33);
  });

  it('writes the AGT information of the MORE panel', () => {
    const advice = {
      outOfLimits: 'FWD' as const,
      limit: 37,
      toLimit: { transfer: 1500, trimTankQuantity: 9500, achievable: true },
      toTarget: { transfer: 6800, trimTankQuantity: 14_800, achievable: true },
      optimizedTowCg: 39.6,
    };
    const lines = groundTransferLines(advice, 36.4, true);
    expect(lines.filter((l) => l.warning).map((l) => l.text)).toEqual([
      'WARNING: TOCG out of the operational limits (too FWD).',
      'TOCG = 36.4% LIM FWD = 37.0%',
    ]);
    expect(lines.map((l) => l.text)).toContain('MIN TRIM TK QTY = 9500 kg.');
    expect(lines.map((l) => l.text)).toContain('Transfer 1500 kg from wings to TRIM TK.');
    expect(lines.map((l) => l.text)).toContain('- For optimized TOCG (39.6%):');

    const within = groundTransferLines(
      { ...advice, outOfLimits: null, limit: null, toLimit: null, toTarget: { ...advice.toTarget, transfer: -2000 } },
      40,
      false,
    );
    expect(within[0].text).toBe('- For optimized TOCG (39.6%):');
    expect(within[2].text).toBe('Transfer 4409 lbs from TRIM TK to wings.');

    const onTarget = groundTransferLines(
      { ...advice, outOfLimits: null, limit: null, toLimit: null, toTarget: { ...advice.toTarget, transfer: 0.2 } },
      39.5,
      true,
    );
    expect(onTarget[2].text).toBe('No transfer needed.');
  });

  it('has no transfer to a limit within the limits, and flags a transfer the tanks cannot give', () => {
    const distribution = LOADSHEET_FUEL_TANKS.map(() => 0);
    distribution[3] = 500;
    distribution[6] = 500;
    const zeroFuel = { zfw: 330_000, zfcg: 38 };
    const towCg = grossWeightCg(zeroFuel, distribution);
    const within = groundTransferAdvice(zeroFuel, distribution, 331_000, towCg, { forward: 29, aft: 43 }, DENSITY);
    expect(within.outOfLimits).toBeNull();
    expect(within.toLimit).toBeNull();
    // 1 t of inner tank fuel cannot move the CG of a 331 t aircraft from 38 % to 39.5 %
    expect(within.toTarget.achievable).toBe(false);
  });
});
