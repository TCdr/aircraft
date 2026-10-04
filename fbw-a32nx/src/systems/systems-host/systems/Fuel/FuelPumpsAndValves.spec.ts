// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FuelSwitchAccess } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import {
  A320_CROSSFEED_PB_IS_ON_VAR,
  A320_CROSSFEED_VALVE,
  A320_FUEL_MODE_SEL_MAN_VAR,
  centreTransferValveDisagreement,
  centreTransferValveOpenRatio,
  ctrTkXfrPbIsOnVar,
  ctrTkXfrValveNotFullyClosedVar,
  ctrTkXfrValveNotFullyOpenVar,
  FuelPumpsAndValves,
  isCentreTransferValveCommandedOpen,
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

describe('A320 centre tank transfer valve (FCOM DSC-28-10 CENTER TANK FUEL TRANSFER, jet pump variant)', () => {
  it('is open as far as the less open of its two MSFS valves in series, in AUTO', () => {
    expect(centreTransferValveOpenRatio(1, 1, false)).toBe(1);
    expect(centreTransferValveOpenRatio(1, 0, false)).toBe(0);
    expect(centreTransferValveOpenRatio(0, 1, false)).toBe(0);
  });

  it('follows its inhibit valve alone in MAN, the junction bypassing the auto valve', () => {
    expect(centreTransferValveOpenRatio(1, 0, true)).toBe(1);
    expect(centreTransferValveOpenRatio(0, 1, true)).toBe(0);
  });

  it('is commanded open by the pb-sw ON with MAN, or with AUTO when the FLSCU opens it; closed by the pb-sw OFF', () => {
    expect(isCentreTransferValveCommandedOpen(true, true, false)).toBe(true);
    expect(isCentreTransferValveCommandedOpen(true, false, true)).toBe(true);
    expect(isCentreTransferValveCommandedOpen(true, false, false)).toBe(false);
    expect(isCentreTransferValveCommandedOpen(false, true, true)).toBe(false);
  });

  it('disagrees "failed in open position" when open while commanded closed, "in closed position" in the other case', () => {
    expect(centreTransferValveDisagreement(false, 1)).toEqual({ notFullyClosed: true, notFullyOpen: false });
    expect(centreTransferValveDisagreement(true, 0)).toEqual({ notFullyClosed: false, notFullyOpen: true });
    expect(centreTransferValveDisagreement(true, 1)).toEqual({ notFullyClosed: false, notFullyOpen: false });
    expect(centreTransferValveDisagreement(false, 0)).toEqual({ notFullyClosed: false, notFullyOpen: false });
  });
});

describe('A320 centre tank transfer valve failures', () => {
  const activeFailures = new Set<number>();
  const commands: string[] = [];
  /** The MSFS valves follow their switch at once (the transfer valves have no OpeningTime) */
  const valves: FuelSwitchAccess = {
    isSelected: (selectionVar) => simVars.get(selectionVar) === true,
    setSelected: (selectionVar, on) => simVars.set(selectionVar, on),
    isSwitchOn: (index) => simVars.get(`A:FUELSYSTEM VALVE SWITCH:${index}`) === 1,
    position: (index) => (simVars.get(`A:FUELSYSTEM VALVE SWITCH:${index}`) === 1 ? 1 : 0),
    command: (index, on) => {
      commands.push(`VALVE ${index} ${on ? 'ON' : 'OFF'}`);
      simVars.set(`A:FUELSYSTEM VALVE SWITCH:${index}`, on ? 1 : 0);
    },
  };
  const pumps: FuelSwitchAccess = { ...valves, command: () => {} };
  let system: FuelPumpsAndValves;

  /** An MSFS trigger (the FLSCU) opens or closes an auto valve */
  const flscu = (valve: number, open: boolean) => simVars.set(`A:FUELSYSTEM VALVE SWITCH:${valve}`, open ? 1 : 0);

  const run = (durationMs: number) => {
    for (let time = 0; time < durationMs; time += 200) {
      system.update(200);
    }
  };

  /** A loaded flight in AUTO: both CTR TK XFR pb-sw ON, the inner tanks not full (the FLSCU opens the auto valves) */
  const loadTransferring = () => {
    for (const valve of [9, 10, 11, 12]) {
      simVars.set(`A:FUELSYSTEM VALVE SWITCH:${valve}`, 1);
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
      pumps,
      valves,
    );
  });

  it('takes the pb-sw selections from the loaded flight and gives no fault while the FLSCU opens and closes the valve', () => {
    loadTransferring();
    run(1000);
    expect(simVars.get(ctrTkXfrPbIsOnVar('L'))).toBe(true);
    expect(simVars.get(ctrTkXfrPbIsOnVar('R'))).toBe(true);
    // the left inner tank is full: the FLSCU closes the left auto valve
    flscu(11, false);
    run(10_000);
    expect(commands).toEqual([]);
    for (const side of ['L', 'R'] as const) {
      expect(simVars.get(ctrTkXfrValveNotFullyClosedVar(side))).toBe(false);
      expect(simVars.get(ctrTkXfrValveNotFullyOpenVar(side))).toBe(false);
    }
  });

  it('closes the inhibit valve from the pb-sw selection without failure', () => {
    loadTransferring();
    run(400);
    simVars.set(ctrTkXfrPbIsOnVar('R'), false);
    run(400);
    expect(commands).toEqual(['VALVE 10 OFF']);
  });

  it('keeps a valve jammed open open against the pb-sw OFF and the FLSCU, and gives NOT FULLY CLOSED', () => {
    loadTransferring();
    run(400);
    activeFailures.add(A320Failure.CentreTankLeftTransferValveJammed);
    run(400);
    simVars.set(ctrTkXfrPbIsOnVar('L'), false);
    run(400);
    flscu(11, false);
    run(1000);
    expect(commands).toEqual(['VALVE 11 ON']);
    expect(valves.position(9)).toBe(1);
    expect(valves.position(11)).toBe(1);
    expect(simVars.get(ctrTkXfrPbIsOnVar('L'))).toBe(false);
    run(FuelPumpsAndValves.CTR_TK_XFR_DISAGREE_CONFIRM_S * 1000);
    expect(simVars.get(ctrTkXfrValveNotFullyClosedVar('L'))).toBe(true);
    expect(simVars.get(ctrTkXfrValveNotFullyOpenVar('L'))).toBe(false);
    expect(simVars.get(ctrTkXfrValveNotFullyClosedVar('R'))).toBe(false);
  });

  it('keeps a valve jammed closed closed in MAN, and gives NOT FULLY OPEN', () => {
    loadTransferring();
    // the right inner tank is full: the FLSCU has closed the right auto valve, the transfer valve is closed
    flscu(12, false);
    run(400);
    activeFailures.add(A320Failure.CentreTankRightTransferValveJammed);
    run(400);
    // FUEL MODE SEL MAN: the junction bypasses the auto valve
    simVars.set(A320_FUEL_MODE_SEL_MAN_VAR, true);
    simVars.set('A:FUELSYSTEM JUNCTION SETTING:5', 2);
    run(400);
    expect(valves.position(10)).toBe(0);
    run(FuelPumpsAndValves.CTR_TK_XFR_DISAGREE_CONFIRM_S * 1000);
    expect(simVars.get(ctrTkXfrValveNotFullyOpenVar('R'))).toBe(true);
    expect(simVars.get(ctrTkXfrValveNotFullyClosedVar('R'))).toBe(false);
    expect(simVars.get(ctrTkXfrPbIsOnVar('R'))).toBe(true);

    // repaired: the valve opens again, the fault goes
    activeFailures.clear();
    run(1000);
    expect(valves.position(10)).toBe(1);
    expect(simVars.get(ctrTkXfrValveNotFullyOpenVar('R'))).toBe(false);
  });
});
