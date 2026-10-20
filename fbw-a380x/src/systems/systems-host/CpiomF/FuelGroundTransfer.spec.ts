// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  GROUND_CG_TARGET_PERCENT,
  GROUND_TRANSFER_RATE_LB_PER_H,
  groundTransferCanMove,
  GroundTransferDirection,
  GroundTransferInputs,
  GroundTransferLogic,
  groundTransferMoves,
  GroundTransferState,
  isAutoGndXfrPbLightOn,
} from './FuelGroundTransfer';
import {
  LEFT_INNER_TANK,
  LEFT_MID_TANK,
  RIGHT_INNER_TANK,
  RIGHT_MID_TANK,
  TankLevels,
  TRIM_TANK,
} from './FuelTransferSchedule';

const POUNDS_PER_GALLON = 6.7;

const ready: GroundTransferInputs = {
  pbOn: true,
  onGround: true,
  enginesRunning: 0,
  allTransferPumpsOn: true,
  cgPercent: 42,
  otherTransferInProgress: false,
  fuelCanMove: () => true,
  overflowDetected: false,
};

describe('automatic ground transfer', () => {
  it('nothing while the AUTO GND XFR pb-sw is released', () => {
    expect(new GroundTransferLogic().update({ ...ready, pbOn: false })).toBe(GroundTransferState.Off);
  });

  it('moves the fuel out of the trim tank while the CG is aft of 39.5 %, completes when it reaches it', () => {
    const logic = new GroundTransferLogic();
    expect(logic.update(ready)).toBe(GroundTransferState.InProgress);
    expect(logic.getDirection()).toBe(GroundTransferDirection.FromTrimTank);
    expect(logic.update({ ...ready, cgPercent: 40 })).toBe(GroundTransferState.InProgress);
    expect(logic.update({ ...ready, cgPercent: GROUND_CG_TARGET_PERCENT })).toBe(GroundTransferState.Completed);
    // Completed until the pb-sw is released (AUTO GND XFR ... OFF)
    expect(logic.update({ ...ready, cgPercent: 42 })).toBe(GroundTransferState.Completed);
    expect(logic.update({ ...ready, pbOn: false })).toBe(GroundTransferState.Off);
  });

  it('moves the fuel into the trim tank while the CG is forward of 39.5 %', () => {
    const logic = new GroundTransferLogic();
    expect(logic.update({ ...ready, cgPercent: 37 })).toBe(GroundTransferState.InProgress);
    expect(logic.getDirection()).toBe(GroundTransferDirection.ToTrimTank);
    expect(logic.update({ ...ready, cgPercent: 39.6 })).toBe(GroundTransferState.Completed);
  });

  it('completes when no more fuel can move (target not achievable)', () => {
    const logic = new GroundTransferLogic();
    expect(logic.update({ ...ready, fuelCanMove: () => false })).toBe(GroundTransferState.Completed);
  });

  it('cannot start without all the transfer pumps on or without the FMS ZFW / ZFCG (FAULT)', () => {
    expect(new GroundTransferLogic().update({ ...ready, allTransferPumpsOn: false })).toBe(GroundTransferState.Fault);
    expect(new GroundTransferLogic().update({ ...ready, cgPercent: null })).toBe(GroundTransferState.Fault);
  });

  it('is aborted when two engines are running, one engine is allowed', () => {
    const logic = new GroundTransferLogic();
    expect(logic.update({ ...ready, enginesRunning: 1 })).toBe(GroundTransferState.InProgress);
    expect(logic.update({ ...ready, enginesRunning: 2 })).toBe(GroundTransferState.Fault);
    expect(logic.update({ ...ready, enginesRunning: 0 })).toBe(GroundTransferState.Fault);
    expect(logic.update({ ...ready, pbOn: false })).toBe(GroundTransferState.Off);
    expect(logic.update(ready)).toBe(GroundTransferState.InProgress);
  });

  it('is aborted by a wing or trim tank overflow (FUEL AUTO GND XFR FAULT)', () => {
    const logic = new GroundTransferLogic();
    expect(logic.update(ready)).toBe(GroundTransferState.InProgress);
    expect(logic.update({ ...ready, overflowDetected: true })).toBe(GroundTransferState.Fault);
  });

  it('the pb-sw light: on while pressed, flashing when aborted', () => {
    expect(isAutoGndXfrPbLightOn(GroundTransferState.Off, 0)).toBe(false);
    expect(isAutoGndXfrPbLightOn(GroundTransferState.InProgress, 0.7)).toBe(true);
    expect(isAutoGndXfrPbLightOn(GroundTransferState.Completed, 0.7)).toBe(true);
    expect(isAutoGndXfrPbLightOn(GroundTransferState.Fault, 0.2)).toBe(true);
    expect(isAutoGndXfrPbLightOn(GroundTransferState.Fault, 0.7)).toBe(false);
  });
});

describe('ground transfer fuel moves', () => {
  const levels = (quantities: Partial<Record<number, number>>): TankLevels => {
    const tanks = [LEFT_INNER_TANK, RIGHT_INNER_TANK, LEFT_MID_TANK, RIGHT_MID_TANK, TRIM_TANK];
    return {
      quantityGal: new Map(tanks.map((tank) => [tank, quantities[tank] ?? 0])),
      capacityGal: new Map(tanks.map((tank) => [tank, tank === TRIM_TANK ? 6260.3 : 12189.4])),
    };
  };
  const oneMinuteGal = GROUND_TRANSFER_RATE_LB_PER_H / 60 / POUNDS_PER_GALLON;

  it('out of the trim tank into the lighter inner tank first (the imbalance is corrected)', () => {
    const tanks = levels({ [TRIM_TANK]: 3_000, [LEFT_INNER_TANK]: 5_000, [RIGHT_INNER_TANK]: 4_950 });
    groundTransferMoves(GroundTransferDirection.FromTrimTank, tanks, POUNDS_PER_GALLON, 60);
    expect(tanks.quantityGal.get(TRIM_TANK)).toBeCloseTo(3_000 - oneMinuteGal);
    expect(tanks.quantityGal.get(LEFT_INNER_TANK)).toBeCloseTo(5_000 + (oneMinuteGal - 50) / 2);
    expect(tanks.quantityGal.get(RIGHT_INNER_TANK)).toBeCloseTo(5_000 + (oneMinuteGal - 50) / 2);
  });

  it('into the trim tank out of the heavier inner tank first, then the mid tanks when the inner tanks are empty', () => {
    const tanks = levels({ [TRIM_TANK]: 100, [LEFT_INNER_TANK]: 1_000, [RIGHT_INNER_TANK]: 900 });
    groundTransferMoves(GroundTransferDirection.ToTrimTank, tanks, POUNDS_PER_GALLON, 60);
    expect(tanks.quantityGal.get(TRIM_TANK)).toBeCloseTo(100 + oneMinuteGal);
    expect(tanks.quantityGal.get(LEFT_INNER_TANK)).toBeCloseTo(900 - (oneMinuteGal - 100) / 2);
    expect(tanks.quantityGal.get(RIGHT_INNER_TANK)).toBeCloseTo(900 - (oneMinuteGal - 100) / 2);

    const emptyInner = levels({ [TRIM_TANK]: 100, [LEFT_MID_TANK]: 1_000, [RIGHT_MID_TANK]: 1_000 });
    groundTransferMoves(GroundTransferDirection.ToTrimTank, emptyInner, POUNDS_PER_GALLON, 60);
    expect(emptyInner.quantityGal.get(LEFT_MID_TANK)).toBeCloseTo(1_000 - oneMinuteGal / 2);
    expect(emptyInner.quantityGal.get(TRIM_TANK)).toBeCloseTo(100 + oneMinuteGal);
  });

  it('can move while the source has fuel and the destination has room', () => {
    expect(groundTransferCanMove(levels({ [TRIM_TANK]: 0 }), GroundTransferDirection.FromTrimTank)).toBe(false);
    expect(groundTransferCanMove(levels({ [TRIM_TANK]: 10 }), GroundTransferDirection.FromTrimTank)).toBe(true);
    expect(
      groundTransferCanMove(levels({ [TRIM_TANK]: 6260.3, [LEFT_INNER_TANK]: 10 }), GroundTransferDirection.ToTrimTank),
    ).toBe(false);
    expect(groundTransferCanMove(levels({ [LEFT_INNER_TANK]: 10 }), GroundTransferDirection.ToTrimTank)).toBe(true);
  });
});
