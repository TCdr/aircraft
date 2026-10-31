// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { A320Failure } from '@failures';
import { Aoc } from '@datalink/aoc';
import { Atc } from '@datalink/atc';
import { Router } from '@datalink/router';
import { AtsuSystem } from './atsu';
import { ATSU_CIRCUIT_BREAKER_VAR } from './AtsuFailureStates';
import { PowerSupplyBusTypes } from './powersupply';

// The flyPad failures reach the ATSU through the real FailuresConsumer, which the sim feeds with the active failure ids
const failuresState = vi.hoisted(() => ({ active: new Set<number>() }));

vi.mock('@flybywiresim/fbw-sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@flybywiresim/fbw-sdk')>();
  class FailuresConsumerDouble {
    register(): void {}

    update(): void {}

    isActive(identifier: number): boolean {
      return failuresState.active.has(identifier);
    }
  }
  return { ...original, FailuresConsumer: FailuresConsumerDouble };
});

describe('systems-host ATSU with its flyPad failures', () => {
  const registeredNames: string[] = [];
  const values = new Map<string, number>();
  let bus: EventBus;
  let atsu: AtsuSystem;
  let powerCalls: string[];
  const originalGetRegisteredId = SimVar.GetRegisteredId;
  const originalGetSimVarValueFastReg = SimVar.GetSimVarValueFastReg;

  const lVar = (name: string) => values.get(name) ?? 0;

  /** Runs the systems-host update loop with AC BUS 1 powered */
  const runPowered = () => {
    bus.getPublisher<PowerSupplyBusTypes>().pub('acBus1', true, false, false);
    atsu.onUpdate();
  };

  beforeEach(() => {
    failuresState.active.clear();
    registeredNames.length = 0;
    values.clear();
    // RegisteredSimVar reads and writes go through registered ids
    (SimVar as any).GetRegisteredId = (name: string) => {
      if (!registeredNames.includes(name)) {
        registeredNames.push(name);
      }
      return registeredNames.indexOf(name);
    };
    (SimVar as any).GetSimVarValueFastReg = (id: number) => values.get(registeredNames[id]) ?? 0;
    vi.stubGlobal('Coherent', {
      on: () => ({ clear() {} }),
      call: (_function: string, id: number, value: number) => {
        values.set(registeredNames[id], value);
        return Promise.resolve();
      },
    });

    powerCalls = [];
    const record = (name: string) => () => void powerCalls.push(name);
    vi.spyOn(Router.prototype, 'powerUp').mockImplementation(record('router up'));
    vi.spyOn(Router.prototype, 'powerDown').mockImplementation(record('router down'));
    vi.spyOn(Atc.prototype, 'powerUp').mockImplementation(record('atc up'));
    vi.spyOn(Atc.prototype, 'powerDown').mockImplementation(record('atc down'));
    vi.spyOn(Aoc.prototype, 'powerUp').mockImplementation(record('aoc up'));
    vi.spyOn(Aoc.prototype, 'powerDown').mockImplementation(record('aoc down'));

    bus = new EventBus();
    atsu = new AtsuSystem(bus);
    atsu.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    (SimVar as any).GetRegisteredId = originalGetRegisteredId;
    (SimVar as any).GetSimVarValueFastReg = originalGetSimVarValueFastReg;
  });

  it('runs the router, ATC and AOC functions and shows nothing failed when supplied', () => {
    runPowered();
    expect(powerCalls).toEqual(['router up', 'atc up', 'aoc up']);
    expect(lVar('L:A32NX_ATSU_OFF')).toBe(0);
    expect(lVar('L:A32NX_DCDU_1_FAILED')).toBe(0);
    expect(lVar('L:A32NX_DCDU_2_FAILED')).toBe(0);
    expect(lVar('L:A32NX_PRINTER_FAILED')).toBe(0);
  });

  it('the ATSU failure powers all three functions down and turns the ATSU off', () => {
    failuresState.active.add(A320Failure.Atsu);
    runPowered();
    expect(powerCalls).toEqual(['aoc down', 'atc down', 'router down']);
    expect(lVar('L:A32NX_ATSU_OFF')).toBe(1);
  });

  it('the AOC failure stops the company datalink only', () => {
    failuresState.active.add(A320Failure.AtsuAoc);
    runPowered();
    expect(powerCalls).toEqual(['aoc down', 'router up', 'atc up']);
    expect(lVar('L:A32NX_ATSU_OFF')).toBe(0);
  });

  it('the DCDU 1, DCDU 2 and printer failures each set their own variable', () => {
    failuresState.active.add(A320Failure.Dcdu1);
    runPowered();
    expect([1, 2].map((dcdu) => lVar(`L:A32NX_DCDU_${dcdu}_FAILED`))).toEqual([1, 0]);
    expect(lVar('L:A32NX_PRINTER_FAILED')).toBe(0);

    failuresState.active.clear();
    failuresState.active.add(A320Failure.Dcdu2);
    runPowered();
    expect([1, 2].map((dcdu) => lVar(`L:A32NX_DCDU_${dcdu}_FAILED`))).toEqual([0, 1]);

    failuresState.active.clear();
    failuresState.active.add(A320Failure.Printer);
    runPowered();
    expect([1, 2].map((dcdu) => lVar(`L:A32NX_DCDU_${dcdu}_FAILED`))).toEqual([0, 0]);
    expect(lVar('L:A32NX_PRINTER_FAILED')).toBe(1);
  });

  it('powers the ATSU down while one of its circuit breakers on 121VU is pulled', () => {
    runPowered();
    powerCalls.length = 0;
    // L16 pulled
    values.set(ATSU_CIRCUIT_BREAKER_VAR, 1 << 15);
    atsu.onUpdate();
    expect(powerCalls).toEqual(['aoc down', 'atc down', 'router down']);
    expect(lVar('L:A32NX_ATSU_OFF')).toBe(1);
  });
});
