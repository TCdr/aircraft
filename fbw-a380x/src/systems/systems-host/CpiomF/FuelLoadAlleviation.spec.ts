// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  FROM_OUTER_TANKS_RATE_LB_PER_H,
  FROM_TRIM_TANK_RATE_LB_PER_H,
  LoadAlleviationInputs,
  LoadAlleviationPumps,
  loadAlleviationMoves,
  LoadAlleviationTransferLogic,
  TO_OUTER_TANKS_RATE_LB_PER_H,
} from './FuelLoadAlleviation';
import {
  FEED_TANK_1,
  FEED_TANK_2,
  FEED_TANK_3,
  FEED_TANK_4,
  LEFT_INNER_TANK,
  LEFT_MID_TANK,
  LEFT_OUTER_TANK,
  RIGHT_INNER_TANK,
  RIGHT_MID_TANK,
  RIGHT_OUTER_TANK,
  TankLevels,
  TRIM_TANK,
} from './FuelTransferSchedule';

const POUNDS_PER_GALLON = 6.7;

const cruise: LoadAlleviationInputs = {
  inFlight: true,
  fobLb: 300_000,
  outerTanksFull: false,
  remainingTimeToDestinationMin: 400,
  pressureAltitudeFt: 37_000,
  outerTanksLb: [15_000, 15_000],
  trimTankEmpty: false,
  trimTankIsolated: false,
};

/** Runs the logic for a time, one update per second */
function run(logic: LoadAlleviationTransferLogic, inputs: LoadAlleviationInputs, seconds: number) {
  let result = logic.update(inputs, 0);
  for (let s = 0; s < seconds; s++) {
    result = logic.update(inputs, 1);
  }
  return result;
}

describe('load alleviation transfer to the outer tanks (A380 FCOM DSC-28-30, a380_fcom.txt l.59445-59470)', () => {
  it('runs in flight when the FOB is greater than 110 200 lb and the outer tanks are not full', () => {
    const logic = new LoadAlleviationTransferLogic();
    expect(logic.update(cruise, 1).toOuterTanks).toBe(true);
    expect(logic.update({ ...cruise, outerTanksFull: true }, 1).toOuterTanks).toBe(false);
    expect(logic.update({ ...cruise, fobLb: 110_000 }, 1).toOuterTanks).toBe(false);
    expect(logic.update({ ...cruise, inFlight: false }, 1).toOuterTanks).toBe(false);
  });

  it('not once a transfer before landing has started (design choice)', () => {
    const logic = new LoadAlleviationTransferLogic();
    run(logic, { ...cruise, remainingTimeToDestinationMin: 20 }, 200);
    expect(logic.update({ ...cruise, remainingTimeToDestinationMin: 20 }, 1).toOuterTanks).toBe(false);
  });
});

describe('load alleviation transfer from the trim tank (l.59472-59524)', () => {
  it('starts when the RTD has been below 80 min for 3 min', () => {
    const logic = new LoadAlleviationTransferLogic();
    const below80 = { ...cruise, remainingTimeToDestinationMin: 79 };
    expect(run(logic, below80, 179).fromTrimTank).toBe(false);
    expect(logic.update(below80, 1).fromTrimTank).toBe(true);
  });

  it('starts when the aircraft goes below FL 245 after having been above FL 255', () => {
    const logic = new LoadAlleviationTransferLogic();
    const noRtd = { ...cruise, remainingTimeToDestinationMin: null };
    expect(logic.update({ ...noRtd, pressureAltitudeFt: 30_000 }, 1).fromTrimTank).toBe(false);
    expect(logic.update({ ...noRtd, pressureAltitudeFt: 25_000 }, 1).fromTrimTank).toBe(false);
    expect(logic.update({ ...noRtd, pressureAltitudeFt: 24_000 }, 1).fromTrimTank).toBe(true);
    // A climb that never went above FL 255 does not start it
    const lowFlight = new LoadAlleviationTransferLogic();
    expect(lowFlight.update({ ...noRtd, pressureAltitudeFt: 25_000 }, 1).fromTrimTank).toBe(false);
    expect(lowFlight.update({ ...noRtd, pressureAltitudeFt: 20_000 }, 1).fromTrimTank).toBe(false);
  });

  it('stops when the RTD goes above 80 min and resumes below 78 min', () => {
    const logic = new LoadAlleviationTransferLogic();
    run(logic, { ...cruise, remainingTimeToDestinationMin: 70 }, 200);
    expect(logic.update({ ...cruise, remainingTimeToDestinationMin: 81 }, 1).fromTrimTank).toBe(false);
    expect(logic.update({ ...cruise, remainingTimeToDestinationMin: 79 }, 1).fromTrimTank).toBe(false);
    expect(logic.update({ ...cruise, remainingTimeToDestinationMin: 77 }, 1).fromTrimTank).toBe(true);
  });

  it('stops when the trim tank is empty or TRIM TK FEED is in ISOL', () => {
    const logic = new LoadAlleviationTransferLogic();
    run(logic, { ...cruise, remainingTimeToDestinationMin: 70 }, 200);
    expect(logic.update({ ...cruise, remainingTimeToDestinationMin: 70, trimTankEmpty: true }, 1).fromTrimTank).toBe(
      false,
    );
    expect(logic.update({ ...cruise, remainingTimeToDestinationMin: 70, trimTankIsolated: true }, 1).fromTrimTank).toBe(
      false,
    );
    expect(logic.update({ ...cruise, remainingTimeToDestinationMin: 70 }, 1).fromTrimTank).toBe(true);
  });

  it('starts again at each flight', () => {
    const logic = new LoadAlleviationTransferLogic();
    run(logic, { ...cruise, remainingTimeToDestinationMin: 70 }, 200);
    logic.update({ ...cruise, inFlight: false }, 1);
    expect(logic.update(cruise, 1).fromTrimTank).toBe(false);
  });
});

describe('load alleviation transfer from the outer tanks (l.59526-59576)', () => {
  it('starts when the RTD has been below 30 min for 3 min, with an outer tank above 8 800 lb', () => {
    const logic = new LoadAlleviationTransferLogic();
    const below30 = { ...cruise, remainingTimeToDestinationMin: 29 };
    expect(run(logic, below30, 179).fromOuterTanks).toBe(false);
    expect(logic.update(below30, 1).fromOuterTanks).toBe(true);
    expect(logic.update({ ...below30, outerTanksLb: [8_800, 8_700] }, 1).fromOuterTanks).toBe(false);
  });

  it('stops when the RTD goes above 30 min and resumes below 28 min', () => {
    const logic = new LoadAlleviationTransferLogic();
    run(logic, { ...cruise, remainingTimeToDestinationMin: 20 }, 200);
    expect(logic.update({ ...cruise, remainingTimeToDestinationMin: 31 }, 1).fromOuterTanks).toBe(false);
    expect(logic.update({ ...cruise, remainingTimeToDestinationMin: 29 }, 1).fromOuterTanks).toBe(false);
    expect(logic.update({ ...cruise, remainingTimeToDestinationMin: 27 }, 1).fromOuterTanks).toBe(true);
  });
});

describe('load alleviation fuel moves', () => {
  const allPumps: LoadAlleviationPumps = {
    innerFwd: [true, true],
    innerAft: [true, true],
    midFwd: [true, true],
    midAft: [true, true],
    outer: [true, true],
    trim: [true, true],
  };
  const capacity = new Map<number, number>([
    [LEFT_OUTER_TANK, 2731.5],
    [FEED_TANK_1, 7299.6],
    [LEFT_MID_TANK, 9632],
    [LEFT_INNER_TANK, 12189.4],
    [FEED_TANK_2, 7753.2],
    [FEED_TANK_3, 7753.2],
    [RIGHT_INNER_TANK, 12189.4],
    [RIGHT_MID_TANK, 9632],
    [FEED_TANK_4, 7299.6],
    [RIGHT_OUTER_TANK, 2731.5],
    [TRIM_TANK, 6260.3],
  ]);
  const levels = (quantities: Partial<Record<number, number>>): TankLevels => ({
    quantityGal: new Map([...capacity.keys()].map((tank) => [tank, quantities[tank] ?? 0])),
    capacityGal: capacity,
  });
  const none = { toOuterTanks: false, fromTrimTank: false, fromOuterTanks: false };
  const oneHour = 3600;

  it('to the outer tanks at 44 100 lb/h per outer tank, from the inner tanks, then the mid tanks', () => {
    const tanks = levels({ [LEFT_INNER_TANK]: 10_000, [RIGHT_INNER_TANK]: 0, [RIGHT_MID_TANK]: 5_000 });
    loadAlleviationMoves({ ...none, toOuterTanks: true }, tanks, allPumps, POUNDS_PER_GALLON, 600);
    const tenMinutesGal = TO_OUTER_TANKS_RATE_LB_PER_H / 6 / POUNDS_PER_GALLON;
    expect(tanks.quantityGal.get(LEFT_OUTER_TANK)).toBeCloseTo(tenMinutesGal);
    expect(tanks.quantityGal.get(LEFT_INNER_TANK)).toBeCloseTo(10_000 - tenMinutesGal);
    expect(tanks.quantityGal.get(RIGHT_OUTER_TANK)).toBeCloseTo(tenMinutesGal);
    expect(tanks.quantityGal.get(RIGHT_MID_TANK)).toBeCloseTo(5_000 - tenMinutesGal);
  });

  it('to the outer tanks with the aft pump of the tank when its fwd pump is failed (CASE 4), none without both', () => {
    const tanks = levels({ [LEFT_INNER_TANK]: 10_000, [RIGHT_INNER_TANK]: 10_000 });
    const pumps = { ...allPumps, innerFwd: [false, false] as const, innerAft: [true, false] as const };
    loadAlleviationMoves({ ...none, toOuterTanks: true }, tanks, pumps, POUNDS_PER_GALLON, 600);
    expect(tanks.quantityGal.get(LEFT_OUTER_TANK)).toBeGreaterThan(0);
    expect(tanks.quantityGal.get(RIGHT_OUTER_TANK)).toBe(0);
  });

  it('from the trim tank at 44 100 lb/h into the feed tanks, then the mid tanks when the feed tanks are full', () => {
    const tanks = levels({
      [TRIM_TANK]: 6_000,
      [FEED_TANK_1]: 7299.6,
      [FEED_TANK_2]: 7753.2,
      [FEED_TANK_3]: 7753.2,
      [FEED_TANK_4]: 7290,
    });
    loadAlleviationMoves({ ...none, fromTrimTank: true }, tanks, allPumps, POUNDS_PER_GALLON, 60);
    const oneMinuteGal = FROM_TRIM_TANK_RATE_LB_PER_H / 60 / POUNDS_PER_GALLON;
    expect(tanks.quantityGal.get(TRIM_TANK)).toBeCloseTo(6_000 - oneMinuteGal);
    expect(tanks.quantityGal.get(FEED_TANK_4)).toBeCloseTo(7299.6);
    expect(tanks.quantityGal.get(LEFT_MID_TANK)).toBeCloseTo((oneMinuteGal - 9.6) / 2);
    expect(tanks.quantityGal.get(RIGHT_MID_TANK)).toBeCloseTo((oneMinuteGal - 9.6) / 2);
  });

  it('from the trim tank at half the rate with one trim tank pump, none without', () => {
    const tanks = levels({ [TRIM_TANK]: 6_000 });
    loadAlleviationMoves(
      { ...none, fromTrimTank: true },
      tanks,
      { ...allPumps, trim: [true, false] },
      POUNDS_PER_GALLON,
      60,
    );
    expect(tanks.quantityGal.get(TRIM_TANK)).toBeCloseTo(
      6_000 - FROM_TRIM_TANK_RATE_LB_PER_H / 120 / POUNDS_PER_GALLON,
    );
    const noPump = levels({ [TRIM_TANK]: 6_000 });
    loadAlleviationMoves({ ...none, fromTrimTank: true }, noPump, { ...allPumps, trim: [false, false] }, 6.7, 60);
    expect(noPump.quantityGal.get(TRIM_TANK)).toBe(6_000);
  });

  it('from each outer tank at 33 050 lb/h down to 8 800 lb, into the feed tanks of its side', () => {
    const tanks = levels({ [LEFT_OUTER_TANK]: 2_700, [RIGHT_OUTER_TANK]: 1_300 });
    loadAlleviationMoves({ ...none, fromOuterTanks: true }, tanks, allPumps, POUNDS_PER_GALLON, oneHour);
    const halfFullGal = 8_800 / POUNDS_PER_GALLON;
    expect(tanks.quantityGal.get(LEFT_OUTER_TANK)).toBeCloseTo(halfFullGal);
    const leftFeedTanksGal = (tanks.quantityGal.get(FEED_TANK_1) ?? 0) + (tanks.quantityGal.get(FEED_TANK_2) ?? 0);
    expect(leftFeedTanksGal).toBeCloseTo(2_700 - halfFullGal);
    // below 8 800 lb: nothing leaves
    expect(tanks.quantityGal.get(RIGHT_OUTER_TANK)).toBe(1_300);
    // the rate
    const oneMinute = levels({ [LEFT_OUTER_TANK]: 2_700 });
    loadAlleviationMoves({ ...none, fromOuterTanks: true }, oneMinute, allPumps, POUNDS_PER_GALLON, 60);
    expect(oneMinute.quantityGal.get(LEFT_OUTER_TANK)).toBeCloseTo(
      2_700 - FROM_OUTER_TANKS_RATE_LB_PER_H / 60 / POUNDS_PER_GALLON,
    );
  });
});
