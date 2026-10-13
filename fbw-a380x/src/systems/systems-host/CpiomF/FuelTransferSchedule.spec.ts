// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import {
  FEED_TANK_1,
  FEED_TANK_2,
  FEED_TANKS,
  LEFT_MID_TANK,
  LEGACY_THRESHOLD_POUNDS_PER_GALLON,
  mainTransferThresholds,
  moveFuel,
  NORMAL_MAIN_TRANSFER_THRESHOLDS,
  REDUCED_MAIN_TRANSFER_THRESHOLDS,
  remainingTimeToDestinationMin,
  RIGHT_MID_TANK,
  TankLevels,
  TRIM_TANK,
} from './FuelTransferSchedule';

const lb = (gallons: number) => gallons * LEGACY_THRESHOLD_POUNDS_PER_GALLON;

describe('main transfer thresholds (A380 FCOM DSC-28-30, a380_fcom.txt l.59243-59255)', () => {
  it('keeps the normal thresholds of LegacyFuel: 43 100 lb (FEED TK 1 and 4) and 45 950 lb (FEED TK 2 and 3)', () => {
    expect(mainTransferThresholds(null)).toBe(NORMAL_MAIN_TRANSFER_THRESHOLDS);
    expect(mainTransferThresholds(90)).toBe(NORMAL_MAIN_TRANSFER_THRESHOLDS);
    expect(NORMAL_MAIN_TRANSFER_THRESHOLDS).toEqual({
      outerFeedTanksStartGal: 6436,
      outerFeedTanksStopGal: 6764,
      innerFeedTanksStartGal: 6857,
      innerFeedTanksStopGal: 7186,
    });
  });

  it('reduces them to 36 500 lb and 39 350 lb (+ 2 200 lb) when the remaining time to destination is below 90 min', () => {
    const reduced = mainTransferThresholds(89.9);
    expect(reduced).toBe(REDUCED_MAIN_TRANSFER_THRESHOLDS);
    expect(lb(reduced.outerFeedTanksStartGal)).toBeCloseTo(36_500, -1);
    expect(lb(reduced.outerFeedTanksStopGal)).toBeCloseTo(38_700, -1);
    expect(lb(reduced.innerFeedTanksStartGal)).toBeCloseTo(39_350, -1);
    expect(lb(reduced.innerFeedTanksStopGal)).toBeCloseTo(41_550, -1);
  });
});

describe('remaining time to destination from the FMS (REMAINING_FLIGHT_TIME, seconds)', () => {
  const word = (seconds: number, ssm: Arinc429SignStatusMatrix) => Arinc429Word.getRawWord(seconds, ssm);

  it('takes FMS 1, else FMS 2, in normal operation, in minutes', () => {
    expect(remainingTimeToDestinationMin([word(5400, Arinc429SignStatusMatrix.NormalOperation), 0])).toBeCloseTo(90);
    expect(
      remainingTimeToDestinationMin([
        word(0, Arinc429SignStatusMatrix.NoComputedData),
        word(1800, Arinc429SignStatusMatrix.NormalOperation),
      ]),
    ).toBeCloseTo(30);
  });

  it('is null without a destination prediction (no computed data)', () => {
    expect(
      remainingTimeToDestinationMin([
        word(0, Arinc429SignStatusMatrix.NoComputedData),
        word(0, Arinc429SignStatusMatrix.NoComputedData),
      ]),
    ).toBeNull();
  });
});

describe('moveFuel', () => {
  const levels = (quantities: [number, number][], capacity = 1000): TankLevels => ({
    quantityGal: new Map(quantities),
    capacityGal: new Map(quantities.map(([tank]) => [tank, tank === TRIM_TANK ? 5000 : capacity])),
  });

  it('fills the emptiest tank of the group first, then shares once balanced', () => {
    const tanks = levels([
      [TRIM_TANK, 1000],
      [FEED_TANK_1, 500],
      [FEED_TANK_2, 400],
    ]);
    moveFuel(tanks, TRIM_TANK, [[FEED_TANK_1, FEED_TANK_2]], 300);
    expect(tanks.quantityGal.get(FEED_TANK_2)).toBeCloseTo(600);
    expect(tanks.quantityGal.get(FEED_TANK_1)).toBeCloseTo(600);
    expect(tanks.quantityGal.get(TRIM_TANK)).toBeCloseTo(700);
  });

  it('goes to the next group when the first one is full, and keeps the fuel when all are full', () => {
    const tanks = levels([
      [TRIM_TANK, 1000],
      ...FEED_TANKS.map((tank): [number, number] => [tank, 990]),
      [LEFT_MID_TANK, 0],
      [RIGHT_MID_TANK, 0],
    ]);
    const moves = moveFuel(tanks, TRIM_TANK, [FEED_TANKS, [LEFT_MID_TANK, RIGHT_MID_TANK]], 100);
    for (const tank of FEED_TANKS) {
      expect(tanks.quantityGal.get(tank)).toBeCloseTo(1000);
    }
    expect(tanks.quantityGal.get(LEFT_MID_TANK)).toBeCloseTo(30);
    expect(tanks.quantityGal.get(RIGHT_MID_TANK)).toBeCloseTo(30);
    expect(moves.reduce((sum, { gallons }) => sum + gallons, 0)).toBeCloseTo(100);

    const full = levels([
      [TRIM_TANK, 1000],
      [FEED_TANK_1, 1000],
    ]);
    expect(moveFuel(full, TRIM_TANK, [[FEED_TANK_1]], 100)).toEqual([]);
    expect(full.quantityGal.get(TRIM_TANK)).toBe(1000);
  });

  it('never moves more than the source tank holds', () => {
    const tanks = levels([
      [TRIM_TANK, 20],
      [FEED_TANK_1, 0],
    ]);
    moveFuel(tanks, TRIM_TANK, [[FEED_TANK_1]], 100);
    expect(tanks.quantityGal.get(TRIM_TANK)).toBeCloseTo(0);
    expect(tanks.quantityGal.get(FEED_TANK_1)).toBeCloseTo(20);
  });
});
