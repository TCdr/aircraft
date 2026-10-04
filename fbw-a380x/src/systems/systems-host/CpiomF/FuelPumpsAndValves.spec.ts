// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FuelSwitchAccess } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import {
  A380_FEED_PUMPS,
  crossFeedPbIsOnVar,
  crossFeedValveAbnormalVar,
  feedPumpLowPressureVar,
  FuelPumpsAndValves,
  isCrossFeedValveDisagree,
  isFeedPumpLowPressure,
} from './FuelPumpsAndValves';

describe('A380 feed pump low pressure (FCOM DSC-28-20 FEED TK MAIN/STBY pb-sw FAULT light)', () => {
  it('is low with the pump ON and not running (failed)', () => {
    expect(isFeedPumpLowPressure(true, false)).toBe(true);
  });

  it('is not low with the pump ON and running, nor with the pump OFF', () => {
    expect(isFeedPumpLowPressure(true, true)).toBe(false);
    expect(isFeedPumpLowPressure(false, false)).toBe(false);
  });
});

describe('A380 crossfeed valve disagreement (FCOM DSC-28-20 CROSSFEED pb-sw)', () => {
  it('is false when the valve follows the pb-sw', () => {
    expect(isCrossFeedValveDisagree(1, true)).toBe(false);
    expect(isCrossFeedValveDisagree(0, false)).toBe(false);
  });

  it('is true when the valve remains closed with the pb-sw ON, or is open with it OFF', () => {
    expect(isCrossFeedValveDisagree(0, true)).toBe(true);
    expect(isCrossFeedValveDisagree(1, false)).toBe(true);
  });
});

/**
 * The sim variables of a test. The SDK modules imported here install the sim's own SimVar functions, which read through
 * the mocked simvar.getValueReg (always 0), so the tests keep their own values.
 */
const simVars = new Map<string, number | boolean>();

describe('A380 feed pump and crossfeed valve failures', () => {
  const activeFailures = new Set<number>();
  const sysHost = { deltaTime: 1000 };
  /** The MSFS pump and valve switches follow the commands at once; the tests read the commands */
  const pumpCommands: [number, boolean][] = [];
  const valveCommands: [number, boolean][] = [];
  const fakeSwitches = (kind: 'PUMP' | 'VALVE', commands: [number, boolean][]): FuelSwitchAccess => ({
    isSelected: (selectionVar) => simVars.get(selectionVar) === true,
    setSelected: (selectionVar, on) => simVars.set(selectionVar, on),
    isSwitchOn: (index) => simVars.get(`A:FUELSYSTEM ${kind} SWITCH:${index}`) === 1,
    position: (index) => Number(simVars.get(`A:FUELSYSTEM ${kind} OPEN:${index}`) ?? 0),
    command: (index, on) => {
      commands.push([index, on]);
      simVars.set(`A:FUELSYSTEM ${kind} SWITCH:${index}`, on ? 1 : 0);
    },
  });
  let system: FuelPumpsAndValves;

  /** A loaded flight: every feed pump switch ON (flight files) */
  const loadPumpSwitchesOn = () => {
    for (const { pump } of A380_FEED_PUMPS) {
      simVars.set(`A:FUELSYSTEM PUMP SWITCH:${pump}`, 1);
    }
  };

  /** The MSFS fuel system: every feed pump pb-sw ON (circuit connected), a pump runs while its MSFS switch is on */
  const runFuelSystem = () => {
    for (const { pump, circuit } of A380_FEED_PUMPS) {
      simVars.set(`A:CIRCUIT CONNECTION ON:${circuit}`, 1);
      simVars.set(`A:FUELSYSTEM PUMP ACTIVE:${pump}`, simVars.get(`A:FUELSYSTEM PUMP SWITCH:${pump}`) === 1 ? 1 : 0);
    }
  };

  beforeEach(() => {
    simVars.clear();
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simVars.get(name) ?? 0);
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: number | boolean) => {
      simVars.set(name, value);
      return Promise.resolve();
    });
    activeFailures.clear();
    pumpCommands.length = 0;
    valveCommands.length = 0;
    system = new FuelPumpsAndValves(
      sysHost,
      { isActive: (failure) => activeFailures.has(failure) },
      fakeSwitches('PUMP', pumpCommands),
      fakeSwitches('VALVE', valveCommands),
    );
  });

  it('keeps every feed pump running without failure', () => {
    loadPumpSwitchesOn();
    runFuelSystem();
    system.onUpdate();
    for (const { tank, kind } of A380_FEED_PUMPS) {
      expect(simVars.get(feedPumpLowPressureVar(tank, kind))).toBe(false);
    }
    expect(pumpCommands).toEqual([]);
  });

  it('stops a failed feed pump (its MSFS switch off), its pb-sw left ON, and gives its low pressure', () => {
    loadPumpSwitchesOn();
    system.onUpdate();
    activeFailures.add(A380Failure.FuelFeedTank3MainPump);
    system.onUpdate();
    expect(pumpCommands).toEqual([[5, false]]);

    runFuelSystem();
    system.onUpdate();
    expect(simVars.get('A:CIRCUIT CONNECTION ON:66')).toBe(1);
    expect(simVars.get(feedPumpLowPressureVar(3, 'MAIN'))).toBe(true);
    expect(simVars.get(feedPumpLowPressureVar(3, 'STBY'))).toBe(false);

    activeFailures.clear();
    system.onUpdate();
    expect(pumpCommands).toEqual([
      [5, false],
      [5, true],
    ]);
  });

  it('opens a crossfeed valve from its CROSSFEED pb-sw selection without failure', () => {
    system.onUpdate();
    simVars.set(crossFeedPbIsOnVar(3), true);
    system.onUpdate();
    expect(valveCommands).toEqual([[48, true]]);
  });

  it('holds a jammed crossfeed valve closed when its CROSSFEED pb-sw is set ON', () => {
    activeFailures.add(A380Failure.FuelCrossFeedValve2Jammed);
    system.onUpdate();
    simVars.set(crossFeedPbIsOnVar(2), true);
    simVars.set(crossFeedPbIsOnVar(1), true);
    system.onUpdate();
    expect(valveCommands).toEqual([[46, true]]);
    expect(simVars.get(crossFeedPbIsOnVar(2))).toBe(true);
  });

  it('gives a crossfeed valve abnormal once it disagrees with its pb-sw longer than its travel time', () => {
    // CROSSFEED 1 pb-sw ON, the valve jammed closed
    activeFailures.add(A380Failure.FuelCrossFeedValve1Jammed);
    system.onUpdate();
    simVars.set(crossFeedPbIsOnVar(1), true);
    for (let second = 0; second < 4; second++) {
      system.onUpdate();
    }
    expect(simVars.get(crossFeedValveAbnormalVar(1))).toBe(false);
    for (let second = 0; second < 3; second++) {
      system.onUpdate();
    }
    expect(simVars.get(crossFeedValveAbnormalVar(1))).toBe(true);
    expect(simVars.get(crossFeedValveAbnormalVar(2))).toBe(false);
  });
});
