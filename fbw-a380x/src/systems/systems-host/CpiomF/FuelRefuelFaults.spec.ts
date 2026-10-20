// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { A380Failure } from '@failures';
import {
  FuelRefuelFaults,
  REFUEL_FAULT_VAR,
  REFUEL_L_ISOL_VALVE_FAULT_VAR,
  REFUEL_STARTED_VAR,
  RefuelFaultLogic,
} from './FuelRefuelFaults';
import { L_WING_TK_OVERFLOW_VAR } from './FuelOverflow';

describe('A380 refuel fault logic', () => {
  it('a failed refuel system stops the refuel and gives FUEL REFUEL FAULT', () => {
    const logic = new RefuelFaultLogic();
    expect(logic.update({ refuelSystemFailed: true, refuelRequested: true, overflowDetected: false })).toEqual({
      stopRefuel: true,
      refuelFault: true,
    });
    expect(
      logic.update({ refuelSystemFailed: true, refuelRequested: false, overflowDetected: false }).refuelFault,
    ).toBe(true);
  });

  it('an overflow stops the refuel; FUEL REFUEL FAULT stays until the overflow is gone', () => {
    const logic = new RefuelFaultLogic();
    expect(logic.update({ refuelSystemFailed: false, refuelRequested: true, overflowDetected: true })).toEqual({
      stopRefuel: true,
      refuelFault: true,
    });
    expect(
      logic.update({ refuelSystemFailed: false, refuelRequested: false, overflowDetected: true }).refuelFault,
    ).toBe(true);
    expect(
      logic.update({ refuelSystemFailed: false, refuelRequested: false, overflowDetected: false }).refuelFault,
    ).toBe(false);
  });

  it('an overflow without a refuel is no refuel fault', () => {
    const logic = new RefuelFaultLogic();
    expect(logic.update({ refuelSystemFailed: false, refuelRequested: false, overflowDetected: true })).toEqual({
      stopRefuel: false,
      refuelFault: false,
    });
  });
});

describe('A380 refuel system failures in the systems host', () => {
  const simVars = new Map<string, number | boolean>();
  const failures = new Set<number>();
  let faults: FuelRefuelFaults;

  beforeEach(() => {
    simVars.clear();
    failures.clear();
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simVars.get(name) ?? 0);
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: number | boolean) => {
      simVars.set(name, value);
      return Promise.resolve();
    });
    faults = new FuelRefuelFaults({ isActive: (failure) => failures.has(failure) });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stops the refuel of the flyPad when the refuel system is failed', () => {
    failures.add(A380Failure.FuelRefuelSystem);
    simVars.set(REFUEL_STARTED_VAR, 1);
    faults.onUpdate();
    expect(simVars.get(REFUEL_STARTED_VAR)).toBe(false);
    expect(simVars.get(REFUEL_FAULT_VAR)).toBe(true);
  });

  it('stops the refuel on a wing tank overflow', () => {
    simVars.set(REFUEL_STARTED_VAR, 1);
    simVars.set(L_WING_TK_OVERFLOW_VAR, 1);
    faults.onUpdate();
    expect(simVars.get(REFUEL_STARTED_VAR)).toBe(false);
    expect(simVars.get(REFUEL_FAULT_VAR)).toBe(true);
  });

  it('lets a normal refuel run', () => {
    simVars.set(REFUEL_STARTED_VAR, 1);
    faults.onUpdate();
    expect(simVars.get(REFUEL_STARTED_VAR)).toBe(1);
    expect(simVars.get(REFUEL_FAULT_VAR)).toBe(false);
  });

  it('gives the FWS a failed refuel isolation valve', () => {
    failures.add(A380Failure.FuelRefuelLeftIsolationValve);
    faults.onUpdate();
    expect(simVars.get(REFUEL_L_ISOL_VALVE_FAULT_VAR)).toBe(true);
  });
});
