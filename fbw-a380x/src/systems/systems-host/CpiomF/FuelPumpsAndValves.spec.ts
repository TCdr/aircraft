// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FuelSwitchAccess } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import {
  A380_FEED_PUMPS,
  A380_FQMS_PUMP_EFFECTS,
  A380_TRANSFER_PUMPS,
  crossFeedPbIsOnVar,
  crossFeedValveAbnormalVar,
  feedPumpLowPressureVar,
  FuelPumpsAndValves,
  isCrossFeedValveDisagree,
  isFeedPumpLowPressure,
  isTransferPumpFaulty,
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

describe('A380 transfer pump fault (FCOM DSC-28-20 transfer pump pb-sw FAULT light, PRO-ABN-ECAM-10-28 PMP FAULT)', () => {
  it('is faulty when failed, whether or not the FQMS runs it and whatever its tank holds', () => {
    expect(isTransferPumpFaulty(true, true, false, 5000)).toBe(true);
    expect(isTransferPumpFaulty(true, true, false, 0)).toBe(true);
  });

  it('is faulty when running in an empty tank', () => {
    expect(isTransferPumpFaulty(true, false, true, 0.05)).toBe(true);
  });

  it('is not faulty when not failed, running normally, stopped, or not run in an empty tank', () => {
    expect(isTransferPumpFaulty(true, false, true, 5000)).toBe(false);
    expect(isTransferPumpFaulty(true, false, false, 5000)).toBe(false);
    expect(isTransferPumpFaulty(true, false, false, 0)).toBe(false);
  });

  it('goes off with the pb-sw OFF', () => {
    expect(isTransferPumpFaulty(false, true, false, 5000)).toBe(false);
    expect(isTransferPumpFaulty(false, false, true, 0)).toBe(false);
  });
});

describe('A380 FQMS transfer pump commands (flight_model.cfg triggers)', () => {
  it('lists every StartPump / StopPump effect of the triggers on the transfer pumps, in the flight_model.cfg order', () => {
    const flightModel = readFileSync(
      join(
        __dirname,
        '../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/common/config/flight_model.cfg',
      ),
      'utf-8',
    );
    const pumpNumbers = new Map<string, number>();
    for (const [, number, name] of flightModel.matchAll(/^Pump\.(\d+)\s*=\s*Name:([^#\r\n]+)/gm)) {
      pumpNumbers.set(name.trim(), Number(number));
    }
    const transferPumps = new Set(A380_TRANSFER_PUMPS.map(({ pump }) => pump));
    const effects: { trigger: number; whenActive: boolean; pump: number; start: boolean }[] = [];
    for (const [, trigger, body] of flightModel.matchAll(/^Trigger\.(\d+)\s*=\s*(.*)$/gm)) {
      for (const part of body.split('#')) {
        const effectList = /^Effect(True|False):(.*)$/.exec(part.trim());
        if (!effectList) {
          continue;
        }
        for (const effect of effectList[2].split(',')) {
          const pumpEffect = /^(Start|Stop)Pump\.(.+)$/.exec(effect.trim());
          const pump = pumpEffect ? pumpNumbers.get(pumpEffect[2].trim()) : undefined;
          if (pumpEffect && pump !== undefined && transferPumps.has(pump)) {
            effects.push({
              trigger: Number(trigger),
              whenActive: effectList[1] === 'True',
              pump,
              start: pumpEffect[1] === 'Start',
            });
          }
        }
      }
    }
    expect(effects.length).toBeGreaterThan(0);
    expect(A380_FQMS_PUMP_EFFECTS).toEqual(effects);
  });
});

describe('A380 transfer pump failures', () => {
  const activeFailures = new Set<number>();
  const sysHost = { deltaTime: 500 };
  const pumpCommands: [number, boolean][] = [];
  const pumps: FuelSwitchAccess = {
    isSelected: () => false,
    setSelected: () => {},
    isSwitchOn: (index) => simVars.get(`A:FUELSYSTEM PUMP SWITCH:${index}`) === 1,
    position: () => 0,
    command: (index, on) => {
      pumpCommands.push([index, on]);
      simVars.set(`A:FUELSYSTEM PUMP SWITCH:${index}`, on ? 1 : 0);
    },
  };
  const valves: FuelSwitchAccess = { ...pumps, command: () => {} };
  let system: FuelPumpsAndValves;

  const leftOuter = A380_TRANSFER_PUMPS.find(({ name }) => name === 'L OUTR TK')!;

  /** The MSFS fuel system: every pb-sw ON; a transfer pump runs while its MSFS switch is on and its tank has fuel */
  const run = (durationMs: number) => {
    for (let time = 0; time < durationMs; time += sysHost.deltaTime) {
      for (const { pump, circuit, tank } of A380_TRANSFER_PUMPS) {
        simVars.set(`A:CIRCUIT CONNECTION ON:${circuit}`, 1);
        const running =
          simVars.get(`A:FUELSYSTEM PUMP SWITCH:${pump}`) === 1 &&
          Number(simVars.get(`A:FUELSYSTEM TANK QUANTITY:${tank}`) ?? 0) > 0;
        simVars.set(`A:FUELSYSTEM PUMP ACTIVE:${pump}`, running ? 1 : 0);
      }
      system.onUpdate();
    }
  };

  /** The FQMS (an MSFS trigger StartPump) starts a pump */
  const fqmsStart = (pump: number) => simVars.set(`A:FUELSYSTEM PUMP SWITCH:${pump}`, 1);

  /** LegacyFuel toggles an MSFS trigger: MSFS applies its StartPump / StopPump effects to the pump switches */
  const fqmsTrigger = (trigger: number, active: boolean) => {
    simVars.set(`A:FUELSYSTEM TRIGGER STATUS:${trigger}`, active ? 1 : 0);
    for (const effect of A380_FQMS_PUMP_EFFECTS) {
      if (effect.trigger === trigger && effect.whenActive === active) {
        simVars.set(`A:FUELSYSTEM PUMP SWITCH:${effect.pump}`, effect.start ? 1 : 0);
      }
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
    system = new FuelPumpsAndValves(sysHost, { isActive: (failure) => activeFailures.has(failure) }, pumps, valves);
    simVars.set(`A:FUELSYSTEM TANK QUANTITY:${leftOuter.tank}`, 800);
  });

  it('leaves the pumps to the FQMS without failure, with no FAULT', () => {
    run(1000);
    fqmsStart(leftOuter.pump);
    run(5000);
    expect(pumpCommands).toEqual([]);
    expect(simVars.get(leftOuter.faultVar)).toBe(false);
  });

  it('stops a failed pump whatever the FQMS commands, and gives its FAULT once confirmed', () => {
    run(1000);
    activeFailures.add(A380Failure.FuelLeftOuterTankPump);
    fqmsStart(leftOuter.pump);
    run(1000);
    expect(pumpCommands).toEqual([[leftOuter.pump, false]]);
    expect(simVars.get(`A:FUELSYSTEM PUMP SWITCH:${leftOuter.pump}`)).toBe(0);
    expect(simVars.get(leftOuter.faultVar)).toBe(false);
    run(FuelPumpsAndValves.TRANSFER_PUMP_FAULT_CONFIRM_S * 1000 + 1000);
    expect(simVars.get(leftOuter.faultVar)).toBe(true);

    // the FAULT light goes off with the pb-sw OFF (the pump circuit disconnected)
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) =>
      name === `A:CIRCUIT CONNECTION ON:${leftOuter.circuit}` ? 0 : simVars.get(name) ?? 0,
    );
    run(500);
    expect(simVars.get(leftOuter.faultVar)).toBe(false);
  });

  it('gives the FAULT of a failed pump that the FQMS does not run (no transfer at that time)', () => {
    run(1000);
    activeFailures.add(A380Failure.FuelLeftOuterTankPump);
    run(FuelPumpsAndValves.TRANSFER_PUMP_FAULT_CONFIRM_S * 1000 + 1000);
    expect(simVars.get(`A:FUELSYSTEM PUMP SWITCH:${leftOuter.pump}`) ?? 0).toBe(0);
    expect(simVars.get(leftOuter.faultVar)).toBe(true);
    // the other pumps have no FAULT
    for (const { faultVar } of A380_TRANSFER_PUMPS.filter((pump) => pump !== leftOuter)) {
      expect(simVars.get(faultVar)).toBe(false);
    }
  });

  it('keeps a repaired trim tank pump off when the FQMS stopped it while it was failed (CG control transfer end)', () => {
    simVars.set('A:FUELSYSTEM TANK QUANTITY:11', 1500);
    run(1000);
    activeFailures.add(A380Failure.FuelTrimTankLeftPump);
    run(1000);
    // CGControlTransferStart: both trim tank pumps start, the failed one is held off
    fqmsTrigger(43, true);
    run(1000);
    expect(simVars.get('A:FUELSYSTEM PUMP SWITCH:19')).toBe(0);
    expect(simVars.get('A:FUELSYSTEM PUMP SWITCH:20')).toBe(1);
    // CGControlTransferEnd: both stop; the switch of the failed pump, already off, does not move
    fqmsTrigger(43, false);
    fqmsTrigger(44, true);
    run(1000);
    activeFailures.clear();
    run(2000);
    expect(simVars.get('A:FUELSYSTEM PUMP SWITCH:19')).toBe(0);
    expect(simVars.get('A:FUELSYSTEM PUMP SWITCH:20')).toBe(0);
    expect(pumpCommands).toEqual([[19, false]]);
  });

  it('starts a repaired pump that the FQMS started while it was failed (outer tank transfer)', () => {
    run(1000);
    activeFailures.add(A380Failure.FuelLeftOuterTankPump);
    run(1000);
    fqmsTrigger(35, true);
    run(1000);
    expect(simVars.get(`A:FUELSYSTEM PUMP SWITCH:${leftOuter.pump}`)).toBe(0);
    activeFailures.clear();
    run(1000);
    expect(simVars.get(`A:FUELSYSTEM PUMP SWITCH:${leftOuter.pump}`)).toBe(1);
  });

  it('gives no FAULT for a pump commanded on in an empty tank (MSFS does not run it)', () => {
    simVars.set(`A:FUELSYSTEM TANK QUANTITY:${leftOuter.tank}`, 0);
    fqmsStart(leftOuter.pump);
    run(5000);
    expect(simVars.get(`A:FUELSYSTEM PUMP ACTIVE:${leftOuter.pump}`)).toBe(0);
    expect(simVars.get(leftOuter.faultVar)).toBe(false);
  });

  it('puts a repaired pump back to the FQMS command', () => {
    activeFailures.add(A380Failure.FuelTrimTankRightPump);
    run(500);
    fqmsStart(20);
    run(1000);
    activeFailures.clear();
    run(1000);
    expect(pumpCommands).toEqual([
      [20, false],
      [20, true],
    ]);
  });
});
