// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClockEvents, EventBus } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import {
  areAocDownlinksInhibited,
  isAocAvailable,
  NSS_AVNCS_ANSU_HEALTHY_VARS,
  NSS_DATA_TO_AVNCS_PB_VAR,
} from './AocAvailability';
import { AtsuSystem } from './atsu';

/** What the AOC of the ATSU was told, in order */
const aocCalls = vi.hoisted(() => [] as string[]);

vi.mock('@datalink/aoc', () => ({
  Aoc: class {
    powerUp() {
      aocCalls.push('powerUp');
    }

    powerDown() {
      aocCalls.push('powerDown');
    }

    setDownlinksInhibited(inhibited: boolean) {
      aocCalls.push(`downlinksInhibited:${inhibited}`);
    }

    initialize() {}
  },
}));
vi.mock('./AtsuFmsClient', () => ({ AtsuFmsClient: class {} }));
vi.mock('./AocAutoPrint', () => ({ AocAutoPrint: class {} }));

describe('A380X AOC availability (COM NSS/AVNCS DATA XFR FAULT)', () => {
  it('runs on either NSS AVNCS ANSU with at least one SCI', () => {
    expect(isAocAvailable([true, true], [false, false])).toBe(true);
    expect(isAocAvailable([false, true], [false, false])).toBe(true);
    expect(isAocAvailable([true, false], [true, false])).toBe(true);
    expect(isAocAvailable([true, true], [false, true])).toBe(true);
  });

  it('stops with both NSS AVNCS ANSUs lost or with both SCIs lost', () => {
    expect(isAocAvailable([false, false], [false, false])).toBe(false);
    expect(isAocAvailable([true, true], [true, true])).toBe(false);
  });
});

describe('NSS DATA TO AVNCS pb-sw OFF', () => {
  it('inhibits the AOC downlinks only while OFF', () => {
    expect(areAocDownlinksInhibited(true)).toBe(true);
    expect(areAocDownlinksInhibited(false)).toBe(false);
  });
});

describe('the ATSU and its AOC', () => {
  const simVars = new Map<string, number>();
  const failureCallbacks = new Map<number, (active: boolean) => void>();
  let bus: EventBus;
  let realTimeMs: number;

  /** One read of the NSS state (twice a second) */
  const readNssState = () => {
    realTimeMs += 1000;
    bus.getPublisher<ClockEvents>().pub('realTime', realTimeMs, false, false);
  };

  beforeEach(() => {
    aocCalls.length = 0;
    simVars.clear();
    failureCallbacks.clear();
    realTimeMs = 0;
    // the bus throttles the 2 Hz read by the wall clock
    vi.spyOn(Date, 'now').mockImplementation(() => realTimeMs);
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simVars.get(name) ?? 0);
    bus = new EventBus();
    new AtsuSystem(bus, {
      register: (failure: number, callback: (active: boolean) => void) => failureCallbacks.set(failure, callback),
    } as unknown as FailuresConsumer);
    // NSS DATA TO AVNCS pb-sw in the normal position, the ANSUs healthy, the AC buses unpowered
    simVars.set(NSS_DATA_TO_AVNCS_PB_VAR, 1);
    NSS_AVNCS_ANSU_HEALTHY_VARS.forEach((name) => simVars.set(name, 1));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('powers the AOC up from the ANSUs, with no AC bus needed, and down once when both SCIs fail', () => {
    readNssState();
    expect(aocCalls).toEqual(['powerUp', 'downlinksInhibited:false']);

    failureCallbacks.get(A380Failure.Sci1)?.(true);
    expect(aocCalls).toEqual(['powerUp', 'downlinksInhibited:false']);
    failureCallbacks.get(A380Failure.Sci2)?.(true);
    expect(aocCalls.slice(2)).toEqual(['powerDown']);

    failureCallbacks.get(A380Failure.Sci2)?.(false);
    expect(aocCalls.slice(3)).toEqual(['powerUp']);
  });

  it('powers the AOC down with both NSS AVNCS ANSUs lost', () => {
    readNssState();
    NSS_AVNCS_ANSU_HEALTHY_VARS.forEach((name) => simVars.set(name, 0));
    readNssState();
    expect(aocCalls).toEqual(['powerUp', 'downlinksInhibited:false', 'powerDown', 'downlinksInhibited:false']);
  });

  it('feeds the NSS DATA TO AVNCS pb-sw state to the AOC downlink inhibition', () => {
    readNssState();
    simVars.set(NSS_DATA_TO_AVNCS_PB_VAR, 0);
    readNssState();
    expect(aocCalls[aocCalls.length - 1]).toBe('downlinksInhibited:true');
    simVars.set(NSS_DATA_TO_AVNCS_PB_VAR, 1);
    readNssState();
    expect(aocCalls[aocCalls.length - 1]).toBe('downlinksInhibited:false');
  });
});
