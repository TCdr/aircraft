// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FuelSwitchAccess } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import {
  A320_CROSSFEED_PB_IS_ON_VAR,
  A320_CROSSFEED_VALVE,
  FuelPumpsAndValves,
  isTankPumpLowPressure,
  tankPumpLowPressureVar,
  tankPumpPbIsOnVar,
} from './FuelPumpsAndValves';

describe('A320 wing tank pump low pressure (FCOM DSC-28-20 L (R) TK PUMPS 1(2) pb-sw)', () => {
  it('is not low with the pump ON and delivering', () => {
    expect(isTankPumpLowPressure(true, true, 25)).toBe(false);
  });

  it('is low with the pump ON and not running (failed, or its tank empty)', () => {
    expect(isTankPumpLowPressure(true, false, 25)).toBe(true);
  });

  it('is low with the pump ON and its outlet pressure low', () => {
    expect(isTankPumpLowPressure(true, true, 2)).toBe(true);
  });

  it('never comes on with the pump OFF', () => {
    expect(isTankPumpLowPressure(false, false, 0)).toBe(false);
  });
});

/**
 * The sim variables of a test. The SDK modules imported here install the sim's own SimVar functions, which read through
 * the mocked simvar.getValueReg (always 0), so the tests keep their own values.
 */
const simVars = new Map<string, number | boolean>();

describe('A320 fuel pump and valve failures', () => {
  const activeFailures = new Set<number>();
  /** The MSFS pump and valve switches follow the commands at once; the tests read the commands */
  const commands: string[] = [];
  const fakeSwitches = (kind: 'PUMP' | 'VALVE'): FuelSwitchAccess => ({
    isSelected: (selectionVar) => simVars.get(selectionVar) === true,
    setSelected: (selectionVar, on) => simVars.set(selectionVar, on),
    isSwitchOn: (index) => simVars.get(`A:FUELSYSTEM ${kind} SWITCH:${index}`) === 1,
    position: (index) => Number(simVars.get(`A:FUELSYSTEM ${kind} OPEN:${index}`) ?? 0),
    command: (index, on) => {
      commands.push(`${kind} ${index} ${on ? 'ON' : 'OFF'}`);
      simVars.set(`A:FUELSYSTEM ${kind} SWITCH:${index}`, on ? 1 : 0);
    },
  });
  let system: FuelPumpsAndValves;

  /** The MSFS fuel system: a wing pump runs and delivers 25 psi while its MSFS switch is on */
  const runFuelSystem = () => {
    for (const [pump, line] of [
      [2, 7],
      [5, 9],
      [3, 8],
      [6, 10],
    ]) {
      const running = simVars.get(`A:FUELSYSTEM PUMP SWITCH:${pump}`) === 1;
      simVars.set(`A:FUELSYSTEM PUMP ACTIVE:${pump}`, running ? 1 : 0);
      simVars.set(`A:FUELSYSTEM LINE FUEL PRESSURE:${line}`, running ? 25 : 0);
    }
  };

  /** A loaded flight with the four wing pumps ON */
  const loadPumpsOn = () => {
    for (const pump of [2, 3, 5, 6]) {
      simVars.set(`A:FUELSYSTEM PUMP SWITCH:${pump}`, 1);
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
    commands.length = 0;
    system = new FuelPumpsAndValves(
      { update: () => {}, isActive: (failure) => activeFailures.has(failure) },
      fakeSwitches('PUMP'),
      fakeSwitches('VALVE'),
    );
  });

  it('keeps every pump delivering without failure, the pb-sw selections taken from the loaded flight', () => {
    loadPumpsOn();
    runFuelSystem();
    system.update(0);
    runFuelSystem();
    system.update(200);
    for (const pump of [2, 3, 5, 6]) {
      expect(simVars.get(tankPumpPbIsOnVar(pump))).toBe(true);
      expect(SimVar.GetSimVarValue(tankPumpLowPressureVar(pump), 'Bool')).toBe(false);
    }
    expect(commands).toEqual([]);
  });

  it('switches a pump off and on from its pb-sw selection', () => {
    loadPumpsOn();
    system.update(0);
    simVars.set(tankPumpPbIsOnVar(3), false);
    system.update(200);
    expect(commands).toEqual(['PUMP 3 OFF']);
    runFuelSystem();
    system.update(200);
    // OFF selected: no low pressure (the FAULT light "does not come on when OFF is selected")
    expect(SimVar.GetSimVarValue(tankPumpLowPressureVar(3), 'Bool')).toBe(false);
  });

  it('stops a failed pump (its MSFS switch off) and gives its low pressure, with the pb-sw left ON', () => {
    loadPumpsOn();
    system.update(0);
    activeFailures.add(A320Failure.LeftTankPump2);
    system.update(200);
    expect(commands).toEqual(['PUMP 5 OFF']);

    runFuelSystem();
    system.update(200);
    expect(simVars.get(tankPumpPbIsOnVar(5))).toBe(true);
    expect(SimVar.GetSimVarValue(tankPumpLowPressureVar(5), 'Bool')).toBe(true);
    expect(SimVar.GetSimVarValue(tankPumpLowPressureVar(2), 'Bool')).toBe(false);

    activeFailures.clear();
    system.update(1000);
    expect(commands).toEqual(['PUMP 5 OFF', 'PUMP 5 ON']);
  });

  it('opens the X FEED valve from the X FEED pb-sw selection without failure', () => {
    system.update(0);
    simVars.set(A320_CROSSFEED_PB_IS_ON_VAR, true);
    system.update(200);
    expect(commands).toEqual([`VALVE ${A320_CROSSFEED_VALVE} ON`]);
  });

  it('holds a jammed X FEED valve closed when the X FEED pb-sw is set ON, the pb-sw staying ON', () => {
    activeFailures.add(A320Failure.CrossFeedValveJammed);
    system.update(0);
    simVars.set(A320_CROSSFEED_PB_IS_ON_VAR, true);
    system.update(200);
    system.update(1000);
    expect(commands).toEqual([]);
    expect(simVars.get(A320_CROSSFEED_PB_IS_ON_VAR)).toBe(true);

    activeFailures.clear();
    system.update(200);
    expect(commands).toEqual([`VALVE ${A320_CROSSFEED_VALVE} ON`]);
  });
});
