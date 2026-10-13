// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FuelSwitchAccess } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import {
  INNER_TANK_FULL_GALLONS,
  isWingTankOverflowing,
  OUTER_XFR_DISAGREE_CONFIRM_S,
  outerTransferDisagreement,
  outerXfrClosedVar,
  outerXfrOpenVar,
  WING_OVERFLOW_CONFIRM_S,
  WingOverflowInputs,
  wingLowLevelSensorFaultVar,
  wingTankLeakVar,
  wingTankOverflowVar,
} from './FuelLevelSensing';
import { A320_FUEL_MODE_SEL_MAN_VAR, FuelPumpsAndValves } from './FuelPumpsAndValves';

/* A320 FCOM PRO-ABN-FUEL FUEL L (R) OUTER XFR CLOSED (a320_fcom.txt l.86104-86105) and OPEN (l.86142) */
describe('outer tank transfer valve disagreement', () => {
  it('is CLOSED when both valves stay closed after the low level command', () => {
    expect(outerTransferDisagreement(true, [0, 0])).toEqual({ closed: true, open: false });
    expect(outerTransferDisagreement(true, [1, 0])).toEqual({ closed: false, open: false });
  });

  it('is OPEN when either valve opens before the low level', () => {
    expect(outerTransferDisagreement(false, [0, 1])).toEqual({ closed: false, open: true });
    expect(outerTransferDisagreement(false, [0, 0])).toEqual({ closed: false, open: false });
  });
});

/* FCOM DSC-28-10-30 (l.42113-42115) and PRO-ABN-FUEL FUEL L (R) WING TK OVERFLOW (l.86638) */
describe('wing tank overflow', () => {
  const transferringIntoFullTank: WingOverflowInputs = {
    innerTankGallons: INNER_TANK_FULL_GALLONS,
    centreTankGallons: 1000,
    centreTransferValveOpenRatio: 1,
    wingTankPumpRunning: true,
  };

  it('overflows when the jet pump keeps transferring into a full inner tank', () => {
    expect(isWingTankOverflowing(transferringIntoFullTank)).toBe(true);
  });

  it('does not overflow without one of the conditions', () => {
    expect(isWingTankOverflowing({ ...transferringIntoFullTank, innerTankGallons: 1800 })).toBe(false);
    expect(isWingTankOverflowing({ ...transferringIntoFullTank, centreTankGallons: 0 })).toBe(false);
    expect(isWingTankOverflowing({ ...transferringIntoFullTank, centreTransferValveOpenRatio: 0 })).toBe(false);
    expect(isWingTankOverflowing({ ...transferringIntoFullTank, wingTankPumpRunning: false })).toBe(false);
  });
});

const simVars = new Map<string, number | boolean>();

describe('A320 fuel level sensing in the systems host', () => {
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

  /** An MSFS trigger moves the four outer transfer valves (Valve.4-7): the inner tank low level opens them */
  const lowLevelTrigger = (open: boolean) => {
    for (const valve of [4, 5, 6, 7]) {
      simVars.set(`A:FUELSYSTEM VALVE SWITCH:${valve}`, open ? 1 : 0);
    }
  };

  const run = (durationMs: number) => {
    for (let time = 0; time < durationMs; time += 200) {
      system.update(200);
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

  it('gives no outer transfer fault while the low level opens the valves and the refuelling closes them', () => {
    run(1000);
    lowLevelTrigger(true);
    run(10_000);
    lowLevelTrigger(false);
    run(10_000);
    expect(commands).toEqual([]);
    for (const side of ['L', 'R'] as const) {
      expect(simVars.get(outerXfrClosedVar(side))).toBe(false);
      expect(simVars.get(outerXfrOpenVar(side))).toBe(false);
    }
  });

  it('keeps the jammed valves of a wing closed at the low level and gives OUTER XFR CLOSED on that wing', () => {
    run(400);
    activeFailures.add(A320Failure.LeftOuterTankTransferValvesJammed);
    run(400);
    lowLevelTrigger(true);
    run(400);
    expect(commands).toEqual(['VALVE 6 OFF', 'VALVE 4 OFF']);
    expect(valves.position(6)).toBe(0);
    expect(valves.position(7)).toBe(1);
    run(OUTER_XFR_DISAGREE_CONFIRM_S * 1000 + 400);
    expect(simVars.get(outerXfrClosedVar('L'))).toBe(true);
    expect(simVars.get(outerXfrClosedVar('R'))).toBe(false);
    expect(simVars.get(outerXfrOpenVar('L'))).toBe(false);
  });

  it('keeps the jammed open valves of a wing open when they should close and gives OUTER XFR OPEN', () => {
    lowLevelTrigger(true);
    run(400);
    activeFailures.add(A320Failure.RightOuterTankTransferValvesJammed);
    run(400);
    // refuelled: the outer tanks are full again, the triggers close the valves
    lowLevelTrigger(false);
    run(800 + OUTER_XFR_DISAGREE_CONFIRM_S * 1000);
    expect(valves.position(7)).toBe(1);
    expect(valves.position(5)).toBe(1);
    expect(simVars.get(outerXfrOpenVar('R'))).toBe(true);
    expect(simVars.get(outerXfrOpenVar('L'))).toBe(false);
  });

  it('tells the FWC the failed low level sensors and the FADEC the leaking wing tanks', () => {
    activeFailures.add(A320Failure.RightWingTankLowLevelSensor);
    activeFailures.add(A320Failure.LeftWingTankLeak);
    run(200);
    expect(simVars.get(wingLowLevelSensorFaultVar('L'))).toBe(false);
    expect(simVars.get(wingLowLevelSensorFaultVar('R'))).toBe(true);
    expect(simVars.get(wingTankLeakVar('L'))).toBe(true);
    expect(simVars.get(wingTankLeakVar('R'))).toBe(false);
  });

  it('detects the overflow of a full inner tank transferring in MAN after its confirmation time', () => {
    // MODE SEL MAN (junction 4 option 2), CTR TK L XFR ON (inhibit valve 9 open), L TK PUMP 1 running, full left
    // inner tank, fuel in the centre tank
    simVars.set(A320_FUEL_MODE_SEL_MAN_VAR, true);
    simVars.set('A:FUELSYSTEM JUNCTION SETTING:4', 2);
    simVars.set('A:FUELSYSTEM VALVE SWITCH:9', 1);
    simVars.set('A:FUELSYSTEM PUMP ACTIVE:2', 1);
    simVars.set('A:FUEL TANK LEFT MAIN QUANTITY', 1816);
    simVars.set('A:FUEL TANK CENTER QUANTITY', 1000);
    run(WING_OVERFLOW_CONFIRM_S * 1000 - 400);
    expect(simVars.get(wingTankOverflowVar('L'))).toBe(false);
    run(1000);
    expect(simVars.get(wingTankOverflowVar('L'))).toBe(true);
    expect(simVars.get(wingTankOverflowVar('R'))).toBe(false);

    // CTR TK L XFR OFF stops the transfer
    simVars.set('L:A32NX_OVHD_FUEL_CTR_TK_L_XFR_PB_IS_ON', false);
    run(1000);
    expect(simVars.get(wingTankOverflowVar('L'))).toBe(false);
  });
});
