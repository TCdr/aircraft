// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  isolateTrimTank,
  isTrimTankGravityTransfer,
  TRIM_LINE_VALVES,
  TRIM_TANK_GRAVITY_RATE_GAL_PER_H,
  TRIM_TANK_PUMPS,
  TRIM_TANK_TRANSFER_TRIGGERS,
  trimTankFeedSelector,
  TrimTankFeedSelector,
  trimTankGravityMoves,
  TrimTankIsolationFuelSystem,
} from './FuelTrimTankFeed';
import { LEFT_INNER_TANK, RIGHT_INNER_TANK, TRIM_TANK } from './FuelTransferSchedule';

describe('TRIM TK FEED selector', () => {
  it('reads AUTO (0, the L:var at flight load), OPEN (1) and ISOL (2)', () => {
    expect(trimTankFeedSelector(0)).toBe(TrimTankFeedSelector.Auto);
    expect(trimTankFeedSelector(1)).toBe(TrimTankFeedSelector.Open);
    expect(trimTankFeedSelector(2)).toBe(TrimTankFeedSelector.Isol);
    expect(trimTankFeedSelector(7)).toBe(TrimTankFeedSelector.Auto);
  });

  it('OPEN: gravity transfer to the inner tanks, with the pitch attitude below 3°', () => {
    expect(isTrimTankGravityTransfer(TrimTankFeedSelector.Open, 2.5)).toBe(true);
    expect(isTrimTankGravityTransfer(TrimTankFeedSelector.Open, 3)).toBe(false);
    expect(isTrimTankGravityTransfer(TrimTankFeedSelector.Auto, 0)).toBe(false);
    expect(isTrimTankGravityTransfer(TrimTankFeedSelector.Isol, 0)).toBe(false);
  });

  it('the gravity flow fills the lighter inner tank first', () => {
    const tanks = {
      quantityGal: new Map([
        [TRIM_TANK, 3_000],
        [LEFT_INNER_TANK, 1_000],
        [RIGHT_INNER_TANK, 2_000],
      ]),
      capacityGal: new Map([
        [TRIM_TANK, 6260.3],
        [LEFT_INNER_TANK, 12189.4],
        [RIGHT_INNER_TANK, 12189.4],
      ]),
    };
    trimTankGravityMoves(tanks, 3600);
    expect(tanks.quantityGal.get(TRIM_TANK)).toBeCloseTo(3_000 - TRIM_TANK_GRAVITY_RATE_GAL_PER_H);
    expect(tanks.quantityGal.get(LEFT_INNER_TANK)).toBeCloseTo(2_000);
    expect(tanks.quantityGal.get(RIGHT_INNER_TANK)).toBeCloseTo(2_000);
  });

  it('ISOL: stops the trim tank transfer triggers and pumps, closes the trim line valves', () => {
    const activeTriggers = new Set([24, 28, 43, 1]);
    const pumpsOn = new Set([19, 20, 12]);
    const openValves = new Set([45, 43, 11]);
    const fuelSystem: TrimTankIsolationFuelSystem = {
      isTriggerActive: (trigger) => activeTriggers.has(trigger),
      setTriggerOff: (trigger) => activeTriggers.delete(trigger),
      isPumpOn: (pump) => pumpsOn.has(pump),
      setPump: (pump, on) => (on ? pumpsOn.add(pump) : pumpsOn.delete(pump)),
      isValveOpen: (valve) => openValves.has(valve),
      setValve: (valve, open) => (open ? openValves.add(valve) : openValves.delete(valve)),
    };
    expect(isolateTrimTank(fuelSystem)).toBe(true);
    expect([...activeTriggers]).toEqual([1]);
    expect([...pumpsOn]).toEqual([12]);
    expect([...openValves]).toEqual([11]);
    // nothing more to command
    expect(isolateTrimTank(fuelSystem)).toBe(false);
  });

  it('isolates the MSFS trim tank transfers, pumps and trim line valves of flight_model.cfg', () => {
    expect(TRIM_TANK_TRANSFER_TRIGGERS).toEqual([24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 43]);
    expect(TRIM_TANK_PUMPS).toEqual([19, 20]);
    expect(TRIM_LINE_VALVES).toEqual([43, 44, 45, 59]);
  });
});
