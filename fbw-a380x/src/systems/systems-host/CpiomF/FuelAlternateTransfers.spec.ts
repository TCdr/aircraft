// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  galleryFunctionalitySwapMoves,
  MAIN_TRANSFER_RATE_LB_PER_H_PER_FEED_TANK,
  OUTER_GRAVITY_START_LOWEST_FEED_TANK_LB,
  OUTER_TANK_GRAVITY_RATE_GAL_PER_H,
  OuterTankGravityTransferLogic,
  outerTankGravityMoves,
} from './FuelAlternateTransfers';
import {
  FEED_TANK_1,
  FEED_TANK_2,
  FEED_TANK_3,
  LEFT_INNER_TANK,
  LEFT_OUTER_TANK,
  RIGHT_OUTER_TANK,
  TankLevels,
} from './FuelTransferSchedule';

const POUNDS_PER_GALLON = 6.7;

const levels = (quantities: [number, number][]): TankLevels => ({
  quantityGal: new Map(quantities),
  capacityGal: new Map(quantities.map(([tank]) => [tank, 8_000])),
});

describe('CASE 5: gravity transfer from the outer tanks (A380 FCOM DSC-28-40, a380_fcom.txt l.59830-59846)', () => {
  it('starts with the outer tank pump failed when the lowest feed tank goes below 28 660 lb', () => {
    const logic = new OuterTankGravityTransferLogic();
    expect(logic.update(true, [true, false], [false, false], OUTER_GRAVITY_START_LOWEST_FEED_TANK_LB + 1)).toEqual([
      false,
      false,
    ]);
    expect(logic.update(true, [true, false], [false, false], OUTER_GRAVITY_START_LOWEST_FEED_TANK_LB - 1)).toEqual([
      true,
      false,
    ]);
    // it goes on when the feed tank fills again
    expect(logic.update(true, [true, false], [false, false], 40_000)).toEqual([true, false]);
  });

  it('stops when the outer tank is empty, the pump is repaired, or on ground', () => {
    const logic = new OuterTankGravityTransferLogic();
    logic.update(true, [true, true], [false, false], 20_000);
    expect(logic.update(true, [true, true], [true, false], 40_000)).toEqual([false, true]);
    expect(logic.update(true, [true, false], [false, false], 40_000)).toEqual([false, false]);
    logic.update(true, [true, true], [false, false], 20_000);
    expect(logic.update(false, [true, true], [false, false], 20_000)).toEqual([false, false]);
  });

  it('moves the outer tank fuel by gravity into FEED TK 2 (left) and 3 (right)', () => {
    const tanks = levels([
      [LEFT_OUTER_TANK, 2_000],
      [RIGHT_OUTER_TANK, 2_000],
      [FEED_TANK_2, 3_000],
      [FEED_TANK_3, 3_000],
    ]);
    outerTankGravityMoves([true, false], tanks, 3600);
    expect(tanks.quantityGal.get(LEFT_OUTER_TANK)).toBeCloseTo(2_000 - OUTER_TANK_GRAVITY_RATE_GAL_PER_H);
    expect(tanks.quantityGal.get(FEED_TANK_2)).toBeCloseTo(3_000 + OUTER_TANK_GRAVITY_RATE_GAL_PER_H);
    expect(tanks.quantityGal.get(RIGHT_OUTER_TANK)).toBe(2_000);
  });
});

describe('CASE 4: gallery functionality swap (l.59820-59828)', () => {
  it('moves the fuel of the tank with the failed fwd pump into the receiving feed tanks, half the rate each', () => {
    const tanks = levels([
      [LEFT_INNER_TANK, 5_000],
      [FEED_TANK_1, 6_000],
      [FEED_TANK_2, 6_000],
    ]);
    galleryFunctionalitySwapMoves([LEFT_INNER_TANK], [FEED_TANK_1, FEED_TANK_2], tanks, POUNDS_PER_GALLON, 60);
    const perFeedTankGal = MAIN_TRANSFER_RATE_LB_PER_H_PER_FEED_TANK / 2 / 60 / POUNDS_PER_GALLON;
    expect(tanks.quantityGal.get(FEED_TANK_1)).toBeCloseTo(6_000 + perFeedTankGal);
    expect(tanks.quantityGal.get(FEED_TANK_2)).toBeCloseTo(6_000 + perFeedTankGal);
    expect(tanks.quantityGal.get(LEFT_INNER_TANK)).toBeCloseTo(5_000 - 2 * perFeedTankGal);
  });

  it('nothing without a receiving feed tank', () => {
    const tanks = levels([
      [LEFT_INNER_TANK, 5_000],
      [FEED_TANK_1, 6_000],
    ]);
    expect(galleryFunctionalitySwapMoves([LEFT_INNER_TANK], [], tanks, POUNDS_PER_GALLON, 60)).toEqual([]);
  });
});
