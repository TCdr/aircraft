// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320AircraftConfig, A320EconParameters } from '@fmgc/flightplanning/A320AircraftConfig';
import { A380AircraftConfig, A380EconParameters } from '@fmgc/flightplanning/A380AircraftConfig';
import {
  ComputationMemo,
  EconFlightConditions,
  EconSpeedInputs,
  EconSpeeds,
  isaDeviationAt,
} from '@fmgc/guidance/vnav/EconSpeeds';

const tonnes = (t: number) => (t * 1000) / 0.45359237;

const a320Cruise = (weightTonnes: number, altitude: number, headwind = 0): EconFlightConditions => ({
  altitude,
  weight: tonnes(weightTonnes),
  isaDeviation: 0,
  headwind,
  tropopause: 36_090,
});

const a320Inputs = (costIndex: number, overrides: Partial<EconSpeedInputs> = {}): EconSpeedInputs => ({
  costIndex,
  cruiseAltitude: 35_000,
  climbWeight: tonnes(65),
  cruiseWeight: tonnes(65),
  descentWeight: tonnes(58),
  isaDeviation: 0,
  climbHeadwind: 0,
  cruiseHeadwind: 0,
  descentHeadwind: 0,
  tropopause: 36_090,
  climbMinSpeed: 215,
  cruiseMinSpeed: 215,
  descentMinSpeed: 201,
  ...overrides,
});

const a320Econ = (costIndex: number, overrides: Partial<EconSpeedInputs> = {}) =>
  EconSpeeds.computeEconSpeeds(A320AircraftConfig, A320EconParameters, a320Inputs(costIndex, overrides))!;

describe('EconSpeeds: ECON speeds from the cost index', () => {
  it('fits the specific range of the A320neo LRC cruise table (NM per 1000 kg, 66 t, ISA)', () => {
    // Table values at the LRC Mach: FL290 207.2, FL330 221.0, FL370 233.9
    for (const [altitude, tableRange] of [
      [29_000, 207.2],
      [33_000, 221.0],
      [37_000, 233.9],
    ]) {
      const fuelPerMilePounds = EconSpeeds.costPerGroundMile(
        A320AircraftConfig,
        A320EconParameters,
        0,
        0.78,
        a320Cruise(66, altitude),
      );
      const rangePerTonne = 1000 / (fuelPerMilePounds * 0.45359237);
      expect(Math.abs(rangePerTonne - tableRange) / tableRange).toBeLessThan(0.035);
    }
  });

  it('flies faster with a higher cost index, up to MMO - 0.02 and VMO - 10 kt', () => {
    const ci0 = a320Econ(0);
    const ci30 = a320Econ(30);
    const ci100 = a320Econ(100);
    const ci999 = a320Econ(999);

    expect(ci0.cruiseMach).toBeLessThan(ci30.cruiseMach);
    expect(ci30.cruiseMach).toBeLessThanOrEqual(ci100.cruiseMach);
    expect(ci999.cruiseMach).toBe(0.8);
    expect(ci0.climbSpeed).toBeLessThan(ci30.climbSpeed);
    expect(ci0.descentSpeed).toBeLessThan(ci30.descentSpeed);
    expect(ci999.climbSpeed).toBe(340);
    expect(ci999.descentSpeed).toBe(340);
    // A320neo order of magnitude: CI 0 near M.76, CI 30 near M.78
    expect(ci0.cruiseMach).toBeGreaterThanOrEqual(0.74);
    expect(ci0.cruiseMach).toBeLessThanOrEqual(0.77);
    expect(ci30.cruiseMach).toBeGreaterThanOrEqual(0.77);
    expect(ci30.cruiseMach).toBeLessThanOrEqual(0.79);
  });

  it('descends near green dot at CI 0 (the longest idle glide) and never below the minimum speed', () => {
    const ci0 = a320Econ(0);
    expect(ci0.descentSpeed).toBeGreaterThanOrEqual(201);
    expect(ci0.descentSpeed).toBeLessThan(240);
  });

  it('uses the cruise Mach as climb and descent Mach, to two decimals', () => {
    const econ = a320Econ(30);
    expect(econ.climbMach).toBe(econ.cruiseMach);
    expect(econ.descentMach).toBe(econ.cruiseMach);
    expect(Math.round(econ.cruiseMach * 100)).toBe(econ.cruiseMach * 100);
  });

  it('flies faster into a headwind and slower with a tailwind', () => {
    const calm = EconSpeeds.econCruiseMach(A320AircraftConfig, A320EconParameters, 10, a320Cruise(65, 35_000), 215)!;
    const headwind = EconSpeeds.econCruiseMach(
      A320AircraftConfig,
      A320EconParameters,
      10,
      a320Cruise(65, 35_000, 100),
      215,
    )!;
    const tailwind = EconSpeeds.econCruiseMach(
      A320AircraftConfig,
      A320EconParameters,
      10,
      a320Cruise(65, 35_000, -100),
      215,
    )!;
    expect(headwind).toBeGreaterThan(calm);
    expect(tailwind).toBeLessThan(calm);
  });

  it('flies faster when heavier', () => {
    const light = EconSpeeds.econCruiseMach(A320AircraftConfig, A320EconParameters, 0, a320Cruise(55, 33_000), 195)!;
    const heavy = EconSpeeds.econCruiseMach(A320AircraftConfig, A320EconParameters, 0, a320Cruise(75, 33_000), 235)!;
    expect(heavy).toBeGreaterThan(light);
  });

  it('cannot compute without the cost index, cruise level or weight', () => {
    expect(EconSpeeds.computeEconSpeeds(A320AircraftConfig, A320EconParameters, a320Inputs(NaN))).toBeNull();
    expect(
      EconSpeeds.computeEconSpeeds(A320AircraftConfig, A320EconParameters, a320Inputs(30, { cruiseWeight: NaN })),
    ).toBeNull();
    expect(
      EconSpeeds.computeEconSpeeds(A320AircraftConfig, A320EconParameters, a320Inputs(30, { cruiseAltitude: 0 })),
    ).toBeNull();
  });

  it('gives A380 cruise Machs between the maximum range Mach and MMO - 0.02', () => {
    const conditions: EconFlightConditions = {
      altitude: 35_000,
      weight: tonnes(450),
      isaDeviation: 0,
      headwind: 0,
      tropopause: 36_090,
    };
    const ci0 = EconSpeeds.econCruiseMach(A380AircraftConfig, A380EconParameters, 0, conditions, 245)!;
    const ci100 = EconSpeeds.econCruiseMach(A380AircraftConfig, A380EconParameters, 100, conditions, 245)!;
    const ci999 = EconSpeeds.econCruiseMach(A380AircraftConfig, A380EconParameters, 999, conditions, 245)!;
    expect(ci0).toBeGreaterThan(0.8);
    expect(ci0).toBeLessThan(0.83);
    expect(ci100).toBeGreaterThan(ci0);
    expect(ci999).toBeCloseTo(0.87, 2);
  });
});

describe('EconSpeeds: long range cruise Mach', () => {
  it('is a little faster than the maximum range Mach', () => {
    const conditions = a320Cruise(65, 35_000);
    const maxRange = EconSpeeds.econCruiseMach(A320AircraftConfig, A320EconParameters, 0, conditions, 215)!;
    const lrc = EconSpeeds.longRangeCruiseMach(A320AircraftConfig, A320EconParameters, conditions, 215)!;
    expect(lrc).toBeGreaterThan(maxRange);
    expect(lrc - maxRange).toBeLessThan(0.05);
  });
});

describe('EconSpeeds: optimum flight level', () => {
  const optimum = (weight: number, recMax = 398, costIndex = 30, trip = null) =>
    EconSpeeds.optimumFlightLevel(
      A320AircraftConfig,
      A320EconParameters,
      costIndex,
      a320Cruise(weight, 0),
      recMax,
      () => 2 * weight + 85,
      trip,
    );

  it('follows the best level of the A320neo LRC cruise table within FL10 (62 t: FL403, 70 t: FL371, 78 t: FL349)', () => {
    expect(Math.abs(optimum(62, 410)! - 403)).toBeLessThanOrEqual(10);
    expect(Math.abs(optimum(70)! - 371)).toBeLessThanOrEqual(10);
    expect(Math.abs(optimum(78)! - 349)).toBeLessThanOrEqual(10);
  });

  it('is lower when heavier and never above the REC MAX', () => {
    expect(optimum(76)!).toBeLessThan(optimum(66)!);
    expect(optimum(60, 370)).toBeLessThanOrEqual(370);
  });

  it('leaves the minimum cruise time between the climb and the descent', () => {
    const shortTrip = {
      remainingDistance: 150,
      currentAltitude: 0,
      destinationElevation: 0,
      minCruiseMinutes: 5,
      climbDistancePerThousandFeet: 4,
      descentDistancePerThousandFeet: 3,
    };
    const level = EconSpeeds.optimumFlightLevel(
      A320AircraftConfig,
      A320EconParameters,
      30,
      a320Cruise(66, 0),
      398,
      () => 217,
      shortTrip,
    )!;
    // 150 NM: 4 + 3 NM per 1000 ft and about 37 NM of cruise leave about FL160
    expect(level).toBeLessThanOrEqual(170);
    expect(level).toBeGreaterThanOrEqual(100);
    expect(
      EconSpeeds.optimumFlightLevel(A320AircraftConfig, A320EconParameters, 30, a320Cruise(66, 0), 398, () => 217, {
        ...shortTrip,
        remainingDistance: 50,
      }),
    ).toBeNull();
  });
});

describe('isaDeviationAt', () => {
  it('uses the lapse rate below the tropopause and -56.5 °C above it', () => {
    expect(isaDeviationAt(10_000, -4.8, null)).toBeCloseTo(0, 1);
    expect(isaDeviationAt(39_000, -46.5, null)).toBeCloseTo(10, 5);
    // A low tropopause entry: ISA is -56.5 °C from there on
    expect(isaDeviationAt(34_000, -56.5, 33_000)).toBeCloseTo(0, 5);
  });
});

describe('ComputationMemo', () => {
  it('computes again only when an input changes, also after a null result', () => {
    const memo = new ComputationMemo<number | null>();
    let runs = 0;
    const compute = () => {
      runs++;
      return null;
    };
    memo.get([1, null, true], compute);
    memo.get([1, null, true], compute);
    expect(runs).toBe(1);
    memo.get([1, 0, true], compute);
    expect(runs).toBe(2);
  });
});
