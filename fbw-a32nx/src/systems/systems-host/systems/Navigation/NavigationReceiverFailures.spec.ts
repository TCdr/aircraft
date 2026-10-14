// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { A320Failure } from '@failures';
import { NavigationReceiverFailures, NavigationReceiverFailuresSource } from './NavigationReceiverFailures';

/**
 * A failures consumer with the given failures active.
 * @param active the active failures
 * @returns the consumer
 */
function failures(active: Set<number>): NavigationReceiverFailuresSource {
  return { register: () => {}, update: () => {}, isActive: (id: number) => active.has(id) };
}

describe('NavigationReceiverFailures (A32NX ATA 34 VOR, DME, ADF and ILS receiver failures)', () => {
  const { GetSimVarValue, SetSimVarValue } = SimVar;
  let simVars: Map<string, any>;
  let toggles: number[];

  afterEach(() => {
    SimVar.GetSimVarValue = GetSimVarValue;
    SimVar.SetSimVarValue = SetSimVarValue;
  });

  beforeEach(() => {
    // the MSFS NAV 3 circuit switched on
    simVars = new Map<string, any>([['A:CIRCUIT SWITCH ON:39', 1]]);
    toggles = [];
    SimVar.GetSimVarValue = (name: string) => simVars.get(name) ?? 0;
    SimVar.SetSimVarValue = (name: string, _unit: string, value: any) => {
      if (name === 'K:ELECTRICAL_CIRCUIT_TOGGLE') {
        toggles.push(value);
      } else {
        simVars.set(name, value);
      }
      return Promise.resolve();
    };
  });

  it('publishes each failed receiver for the displays', () => {
    const active = new Set<number>([A320Failure.Vor1Receiver, A320Failure.Adf2Receiver]);
    const system = new NavigationReceiverFailures(failures(active), () => 0);
    system.init();
    system.onUpdate();

    expect(simVars.get('L:A32NX_VOR_1_FAILED')).toBe(true);
    expect(simVars.get('L:A32NX_VOR_2_FAILED')).toBe(false);
    expect(simVars.get('L:A32NX_ADF_2_FAILED')).toBe(true);
    expect(simVars.get('L:A32NX_DME_1_FAILED')).toBe(false);
    expect(simVars.get('L:A32NX_ILS_2_FAILED')).toBe(false);

    active.clear();
    active.add(A320Failure.Dme2Receiver);
    system.onUpdate();
    expect(simVars.get('L:A32NX_VOR_1_FAILED')).toBe(false);
    expect(simVars.get('L:A32NX_DME_2_FAILED')).toBe(true);
    // no toggle of the NAV 3 circuit without an ILS 1 failure
    expect(toggles).toEqual([]);
  });

  it('switches the MSFS NAV 3 radio off with ILS 1 failed, and on again when the failure is cleared', () => {
    const active = new Set<number>([A320Failure.Ils1Receiver]);
    let now = 0;
    const system = new NavigationReceiverFailures(failures(active), () => now);
    system.init();
    system.onUpdate();
    expect(simVars.get('L:A32NX_ILS_1_FAILED')).toBe(true);
    expect(toggles).toEqual([39]);

    // the sim has not applied the toggle yet: no second toggle within the retry delay
    now = 500;
    system.onUpdate();
    expect(toggles).toEqual([39]);

    simVars.set('A:CIRCUIT SWITCH ON:39', 0);
    active.clear();
    now = 600;
    system.onUpdate();
    expect(toggles).toEqual([39, 39]);
    expect(simVars.get('L:A32NX_ILS_1_FAILED')).toBe(false);
  });

  it('leaves the NAV 3 radio alone with ILS 2 failed (MMR 2 is failed in the systems)', () => {
    const active = new Set<number>([A320Failure.Ils2Receiver]);
    const system = new NavigationReceiverFailures(failures(active), () => 0);
    system.init();
    system.onUpdate();
    expect(simVars.get('L:A32NX_ILS_2_FAILED')).toBe(true);
    expect(toggles).toEqual([]);
  });
});
