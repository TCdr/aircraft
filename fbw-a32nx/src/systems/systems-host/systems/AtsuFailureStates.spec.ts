// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { EventBus } from '@microsoft/msfs-sdk';
import { describe, expect, it, vi } from 'vitest';
import { A320Failure } from '@failures';
import { PowerSupplyBusTypes } from './powersupply';
import { AtsuSystem } from './atsu';
import {
  ATSU_CIRCUIT_BREAKER_VAR,
  AtsuParts,
  AtsuPowerSwitch,
  atsuCircuitBreakerPulled,
  atsuRunStates,
  datalinkInterfaceStates,
} from './AtsuFailureStates';

/*
 * The datalink functions and the sim variable access are replaced by fakes, so that the systems-host AtsuSystem can run
 * here: the router, ATC and AOC record their power transitions, the registered L:vars live in a map by name, and the
 * failures consumer holds the active failures.
 */
const fakes = vi.hoisted(() => ({
  powerCalls: [] as string[],
  vars: new Map<string, number>(),
  activeFailures: new Set<number>(),
}));

vi.mock('@datalink/atc', () => ({
  Atc: class {
    initialize(): void {}
    powerUp(): void {
      fakes.powerCalls.push('up atc');
    }
    powerDown(): void {
      fakes.powerCalls.push('down atc');
    }
  },
}));
vi.mock('@datalink/aoc', () => ({
  Aoc: class {
    initialize(): void {}
    powerUp(): void {
      fakes.powerCalls.push('up aoc');
    }
    powerDown(): void {
      fakes.powerCalls.push('down aoc');
    }
  },
}));
vi.mock('@datalink/router', () => ({
  Router: class {
    initialize(): void {}
    powerUp(): void {
      fakes.powerCalls.push('up router');
    }
    powerDown(): void {
      fakes.powerCalls.push('down router');
    }
  },
}));
vi.mock('@datalink/common', () => ({
  SimVarHandling: class {
    initialize(): void {}
    startPublish(): void {}
    update(): void {}
  },
}));
vi.mock('@flybywiresim/fbw-sdk', async (importOriginal) => {
  const registeredVar = (name: string) => ({
    get: () => fakes.vars.get(name) ?? 0,
    set: (value: number | boolean) => {
      fakes.vars.set(name, Number(value));
    },
  });
  return {
    ...(await importOriginal<object>()),
    FailuresConsumer: class {
      register(): void {}
      update(): void {}
      isActive(failure: number): boolean {
        return fakes.activeFailures.has(failure);
      }
    },
    RegisteredSimVar: {
      create: (name: string) => registeredVar(name),
      createBoolean: (name: string) => ({ ...registeredVar(name), get: () => (fakes.vars.get(name) ?? 0) > 0 }),
    },
  };
});

/** Records the power transitions */
class TestParts implements AtsuParts {
  public readonly calls: string[] = [];

  powerUpAtsu(): void {
    this.calls.push('up atsu');
  }

  powerDownAtsu(): void {
    this.calls.push('down atsu');
  }

  powerUpAoc(): void {
    this.calls.push('up aoc');
  }

  powerDownAoc(): void {
    this.calls.push('down aoc');
  }
}

const supplied = { acBus1Powered: true, circuitBreakerPulled: false, atsuFailed: false, aocFailed: false };

/** The C/B bit of a column of row L of 121VU */
const column = (n: number) => 1 << (n - 1);

/* The flyPad ATSU failures and the DATALINK alerts */
describe('ATSU failures', () => {
  it('the supplied ATSU runs its router, ATC and AOC functions', () => {
    expect(atsuRunStates(supplied)).toEqual({
      atsuRunning: true,
      aocRunning: true,
    });
    expect(atsuRunStates({ ...supplied, acBus1Powered: false })).toEqual({
      atsuRunning: false,
      aocRunning: false,
    });
  });

  it('the failed ATSU stops everything, the failed AOC function stops the company datalink only', () => {
    expect(atsuRunStates({ ...supplied, atsuFailed: true })).toEqual({
      atsuRunning: false,
      aocRunning: false,
    });
    expect(atsuRunStates({ ...supplied, aocFailed: true })).toEqual({
      atsuRunning: true,
      aocRunning: false,
    });
  });

  it('powers the parts up and down on the changes only, the AOC after the router up and before it down', () => {
    const parts = new TestParts();
    const power = new AtsuPowerSwitch(parts);

    // first update without supply: everything down, as the former AC BUS 1 handler
    power.update({ atsuRunning: false, aocRunning: false });
    expect(parts.calls).toEqual(['down aoc', 'down atsu']);

    parts.calls.length = 0;
    power.update({ atsuRunning: true, aocRunning: true });
    power.update({ atsuRunning: true, aocRunning: true });
    expect(parts.calls).toEqual(['up atsu', 'up aoc']);

    parts.calls.length = 0;
    power.update({ atsuRunning: true, aocRunning: false });
    expect(parts.calls).toEqual(['down aoc']);

    parts.calls.length = 0;
    power.update({ atsuRunning: true, aocRunning: true });
    power.update({ atsuRunning: false, aocRunning: false });
    expect(parts.calls).toEqual(['up aoc', 'down aoc', 'down atsu']);
  });
});

/* The ATSU reset by its C/Bs */
describe('ATSU reset by the C/Bs L15 and L16 on 121VU', () => {
  it('reads the C/Bs L15 and L16 of row L only', () => {
    expect(atsuCircuitBreakerPulled(0)).toBe(false);
    expect(atsuCircuitBreakerPulled(column(15))).toBe(true);
    expect(atsuCircuitBreakerPulled(column(16))).toBe(true);
    expect(atsuCircuitBreakerPulled(column(15) | column(16))).toBe(true);
    // the other C/Bs of the row (e.g. L7 and L32, monitored by the SDAC) do not stop the ATSU
    expect(atsuCircuitBreakerPulled(column(7) | column(14) | column(17) | column(32))).toBe(false);
  });

  it('the ATSU does not run while one of its C/Bs is pulled', () => {
    expect(atsuRunStates({ ...supplied, circuitBreakerPulled: true })).toEqual({
      atsuRunning: false,
      aocRunning: false,
    });
  });

  it('pull L16, L15, then push L15, L16: the ATSU is powered down then up again (CPDLC connection dropped)', () => {
    const parts = new TestParts();
    const power = new AtsuPowerSwitch(parts);
    const runWithBits = (bits: number) =>
      power.update(atsuRunStates({ ...supplied, circuitBreakerPulled: atsuCircuitBreakerPulled(bits) }));

    runWithBits(0);
    parts.calls.length = 0;
    runWithBits(column(16));
    runWithBits(column(16) | column(15));
    runWithBits(column(16));
    expect(parts.calls).toEqual(['down aoc', 'down atsu']);
    runWithBits(0);
    expect(parts.calls).toEqual(['down aoc', 'down atsu', 'up atsu', 'up aoc']);
  });
});

/* The DCDU, its screens and the MCDU print */
describe('datalink cockpit interface states', () => {
  const noFailure = { dcdu1Failed: false, dcdu2Failed: false, printerFailed: false };

  it('the DCDUs show INVALID DATA while the ATSU does not run', () => {
    expect(datalinkInterfaceStates(atsuRunStates(supplied), noFailure).atsuOff).toBe(false);
    for (const notRunning of [
      { ...supplied, acBus1Powered: false },
      { ...supplied, circuitBreakerPulled: true },
      { ...supplied, atsuFailed: true },
    ]) {
      expect(datalinkInterfaceStates(atsuRunStates(notRunning), noFailure).atsuOff).toBe(true);
    }
    // a failed AOC function leaves the ATC datalink to the DCDU
    expect(datalinkInterfaceStates(atsuRunStates({ ...supplied, aocFailed: true }), noFailure).atsuOff).toBe(false);
  });

  it('gives each DCDU and the printer its own failure', () => {
    const running = atsuRunStates(supplied);
    expect(datalinkInterfaceStates(running, { ...noFailure, dcdu1Failed: true })).toEqual({
      atsuOff: false,
      dcduFailed: [true, false],
      printerFailed: false,
    });
    expect(datalinkInterfaceStates(running, { ...noFailure, dcdu2Failed: true }).dcduFailed).toEqual([false, true]);
    expect(datalinkInterfaceStates(running, { ...noFailure, printerFailed: true }).printerFailed).toBe(true);
  });

  // The variables the systems-host AtsuSystem writes (tested below) are read by the MCDU and the model as text; the
  // DCDU reads them in DcduFailures.spec
  it('the MCDU and the model read the variables the systems-host ATSU writes', () => {
    const instruments = resolve(__dirname, '../../instruments/src');
    expect(readFileSync(resolve(instruments, 'MCDU/legacy/A320_Neo_CDU_MainDisplay.ts'), 'utf-8')).toContain(
      "'L:A32NX_PRINTER_FAILED'",
    );
    const model = readFileSync(
      resolve(
        __dirname,
        '../../../base/flybywire-aircraft-a320-neo/SimObjects/AirPlanes/FlyByWire_A320_NEO/model/A320_NEO_INTERIOR.xml',
      ),
      'utf-8',
    );
    expect(model).toContain('(L:A32NX_ELEC_DC_1_BUS_IS_POWERED, Bool) (L:A32NX_DCDU_1_FAILED, Bool) ! and if{');
    expect(model).toContain('(L:A32NX_ELEC_DC_2_BUS_IS_POWERED, Bool) (L:A32NX_DCDU_2_FAILED, Bool) ! and if{');
  });
});

/* The systems-host ATSU applies the states with its flyPad failures, its power supply and its C/Bs */
describe('systems-host AtsuSystem', () => {
  const publishAcBus1Power = (bus: EventBus, powered: boolean) =>
    bus.getPublisher<PowerSupplyBusTypes>().pub('acBus1', powered, false);

  function runningAtsu(): { atsu: AtsuSystem; bus: EventBus } {
    fakes.powerCalls.length = 0;
    fakes.vars.clear();
    fakes.activeFailures.clear();
    const bus = new EventBus();
    const atsu = new AtsuSystem(bus);
    atsu.init();
    publishAcBus1Power(bus, true);
    atsu.onUpdate();
    return { atsu, bus };
  }

  it('powers the router, ATC and AOC up with AC BUS 1 and down without', () => {
    const { atsu, bus } = runningAtsu();
    expect(fakes.powerCalls).toEqual(['up router', 'up atc', 'up aoc']);
    expect(fakes.vars.get('L:A32NX_ATSU_OFF')).toBe(0);

    publishAcBus1Power(bus, false);
    atsu.onUpdate();
    expect(fakes.powerCalls.slice(3)).toEqual(['down aoc', 'down atc', 'down router']);
    expect(fakes.vars.get('L:A32NX_ATSU_OFF')).toBe(1);
  });

  it('the ATSU failure stops everything, the AOC failure the company datalink only', () => {
    const { atsu } = runningAtsu();
    fakes.powerCalls.length = 0;
    fakes.activeFailures.add(A320Failure.AtsuAoc);
    atsu.onUpdate();
    expect(fakes.powerCalls).toEqual(['down aoc']);
    expect(fakes.vars.get('L:A32NX_ATSU_OFF')).toBe(0);

    fakes.powerCalls.length = 0;
    fakes.activeFailures.add(A320Failure.Atsu);
    atsu.onUpdate();
    expect(fakes.powerCalls).toEqual(['down atc', 'down router']);
    expect(fakes.vars.get('L:A32NX_ATSU_OFF')).toBe(1);
  });

  it('pulling a C/B of the ATSU on 121VU stops it, pushing it in runs it again', () => {
    expect(ATSU_CIRCUIT_BREAKER_VAR).toBe('L:1:A32NX_CB_121VU_L_TRIPPED_0');
    const { atsu } = runningAtsu();
    fakes.powerCalls.length = 0;
    fakes.vars.set(ATSU_CIRCUIT_BREAKER_VAR, column(16));
    atsu.onUpdate();
    expect(fakes.powerCalls).toEqual(['down aoc', 'down atc', 'down router']);

    fakes.vars.set(ATSU_CIRCUIT_BREAKER_VAR, 0);
    atsu.onUpdate();
    expect(fakes.powerCalls.slice(3)).toEqual(['up router', 'up atc', 'up aoc']);
  });

  it('writes the DCDU and printer failures to the variables the DCDU, the model and the MCDU read', () => {
    const { atsu } = runningAtsu();
    expect([1, 2].map((dcdu) => fakes.vars.get(`L:A32NX_DCDU_${dcdu}_FAILED`))).toEqual([0, 0]);

    fakes.activeFailures.add(A320Failure.Dcdu2);
    atsu.onUpdate();
    expect([1, 2].map((dcdu) => fakes.vars.get(`L:A32NX_DCDU_${dcdu}_FAILED`))).toEqual([0, 1]);

    fakes.activeFailures.add(A320Failure.Dcdu1);
    fakes.activeFailures.add(A320Failure.Printer);
    atsu.onUpdate();
    expect([1, 2].map((dcdu) => fakes.vars.get(`L:A32NX_DCDU_${dcdu}_FAILED`))).toEqual([1, 1]);
    expect(fakes.vars.get('L:A32NX_PRINTER_FAILED')).toBe(1);
  });
});
