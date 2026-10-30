// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSimVars } from '../../../../../fbw-common/src/jest/MockedSimVars';
import { A380Failure } from '@failures';
import {
  DRAIN_BACK_RATE_LB_PER_H,
  FuelOverflow,
  FuelOverflowDetectionReader,
  L_WING_TK_OVERFLOW_VAR,
  OVERFLOW_RATE_LB_PER_H,
  OverflowInputs,
  SurgeTank,
  TRIM_SURGE_TANK_OVERFLOW_LB,
  TRIM_TK_OVERFLOW_VAR,
  WING_SURGE_TANK_OVERFLOW_LB,
} from './FuelOverflow';

const FULL_TANK_DURING_REFUEL: OverflowInputs = {
  inletValveStuckOpen: true,
  tankFull: true,
  tankRoomLb: 0,
  refuelInProgress: true,
  otherTransferPumpsRunning: false,
};

/** The seconds for the overflow rate to put a weight into the surge tank */
const secondsToSpill = (lb: number) => (lb / OVERFLOW_RATE_LB_PER_H) * 3600;

describe('A380 surge tank overflow', () => {
  it('fills the surge tank of a full tank with its inlet valve stuck open during a refuel', () => {
    const surge = new SurgeTank(WING_SURGE_TANK_OVERFLOW_LB);
    const result = surge.update(FULL_TANK_DURING_REFUEL, secondsToSpill(WING_SURGE_TANK_OVERFLOW_LB) - 1);
    expect(result.overflowDetected).toBe(false);
    expect(result.spilledFromPumpedTanksLb).toBe(0);
    expect(surge.update(FULL_TANK_DURING_REFUEL, 2).overflowDetected).toBe(true);
  });

  it('takes the spilled fuel from the pumped tanks when the transfer pumps push it', () => {
    const surge = new SurgeTank(TRIM_SURGE_TANK_OVERFLOW_LB);
    const result = surge.update(
      { ...FULL_TANK_DURING_REFUEL, refuelInProgress: false, otherTransferPumpsRunning: true },
      36,
    );
    expect(result.spilledFromPumpedTanksLb).toBeCloseTo(OVERFLOW_RATE_LB_PER_H / 100, 6);
  });

  it('does not overflow without the failure, with room in the tank, or without fuel pushed', () => {
    for (const inputs of [
      { ...FULL_TANK_DURING_REFUEL, inletValveStuckOpen: false },
      { ...FULL_TANK_DURING_REFUEL, tankFull: false, tankRoomLb: 1000 },
      { ...FULL_TANK_DURING_REFUEL, refuelInProgress: false },
    ]) {
      const surge = new SurgeTank(TRIM_SURGE_TANK_OVERFLOW_LB);
      expect(surge.update(inputs, 3600).overflowDetected).toBe(false);
      expect(surge.surgeFuelLb).toBe(0);
    }
  });

  it('drains back into the tank once it has room, which ends the overflow', () => {
    const surge = new SurgeTank(TRIM_SURGE_TANK_OVERFLOW_LB);
    surge.update(FULL_TANK_DURING_REFUEL, secondsToSpill(TRIM_SURGE_TANK_OVERFLOW_LB + 100));
    const withRoom = { ...FULL_TANK_DURING_REFUEL, tankFull: false, tankRoomLb: 10_000, refuelInProgress: false };
    const drained = surge.update(withRoom, (150 / DRAIN_BACK_RATE_LB_PER_H) * 3600);
    expect(drained.drainedBackLb).toBeCloseTo(150, 6);
    expect(drained.overflowDetected).toBe(false);
  });
});

describe('A380 fuel overflow in the fuel system', () => {
  const simVars = new Map<string, number | boolean>();
  const failures = new Set<number>();
  let overflow: FuelOverflow;

  beforeEach(() => {
    simVars.clear();
    failures.clear();
    mockSimVars(simVars);
    simVars.set('FUEL WEIGHT PER GALLON', 6.7);
    for (let tank = 1; tank <= 11; tank++) {
      simVars.set(`FUELSYSTEM TANK CAPACITY:${tank}`, 5000);
      simVars.set(`FUELSYSTEM TANK QUANTITY:${tank}`, 2000);
    }
    overflow = new FuelOverflow({ deltaTime: 1000 }, { isActive: (failure) => failures.has(failure) });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('FUEL WING TK OVERFLOW: the full L outer tank overflows during a refuel', () => {
    failures.add(A380Failure.FuelLeftOuterTankInletValveStuckOpen);
    simVars.set('FUELSYSTEM TANK QUANTITY:1', 5000);
    simVars.set('L:A32NX_REFUEL_STARTED_BY_USR', 1);
    for (let s = 0; s < secondsToSpill(WING_SURGE_TANK_OVERFLOW_LB) + 2; s++) {
      overflow.onUpdate();
    }
    expect(simVars.get(L_WING_TK_OVERFLOW_VAR)).toBe(true);
    expect(new FuelOverflowDetectionReader().isOverflowDetected()).toBe(true);
  });

  it('FUEL TRIM TK OVERFLOW: the transfer pumps of a mid tank spill its fuel through the full trim tank', () => {
    failures.add(A380Failure.FuelTrimTankInletValveStuckOpen);
    simVars.set('FUELSYSTEM TANK QUANTITY:11', 5000);
    simVars.set('A:FUELSYSTEM PUMP ACTIVE:10', 1);
    const seconds = Math.ceil(secondsToSpill(TRIM_SURGE_TANK_OVERFLOW_LB)) + 1;
    for (let s = 0; s < seconds; s++) {
      overflow.onUpdate();
    }
    expect(simVars.get(TRIM_TK_OVERFLOW_VAR)).toBe(true);
    // Pump.10 is in the left mid tank (Tank.3): the spilled fuel left it
    const spilledGal = (OVERFLOW_RATE_LB_PER_H * seconds) / 3600 / 6.7;
    expect(simVars.get('FUELSYSTEM TANK QUANTITY:3')).toBeCloseTo(2000 - spilledGal, 3);
    expect(simVars.get('FUELSYSTEM TANK QUANTITY:11')).toBe(5000);
  });

  it('moves no fuel without a fuel density (flight loading)', () => {
    failures.add(A380Failure.FuelTrimTankInletValveStuckOpen);
    simVars.set('FUEL WEIGHT PER GALLON', 0);
    simVars.set('FUELSYSTEM TANK QUANTITY:11', 5000);
    simVars.set('A:FUELSYSTEM PUMP ACTIVE:10', 1);
    for (let s = 0; s < 60; s++) {
      overflow.onUpdate();
    }
    expect(simVars.get('FUELSYSTEM TANK QUANTITY:3')).toBe(2000);
  });

  it('the trim tank pumps do not overflow their own tank', () => {
    failures.add(A380Failure.FuelTrimTankInletValveStuckOpen);
    simVars.set('FUELSYSTEM TANK QUANTITY:11', 5000);
    simVars.set('A:FUELSYSTEM PUMP ACTIVE:19', 1);
    for (let s = 0; s < 600; s++) {
      overflow.onUpdate();
    }
    expect(simVars.get(TRIM_TK_OVERFLOW_VAR)).toBe(false);
  });
});
