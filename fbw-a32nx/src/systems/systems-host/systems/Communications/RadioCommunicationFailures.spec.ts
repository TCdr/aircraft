// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { A320Failure } from '@failures';
import { RadioCommunicationFailures, RadioFailuresSource } from './RadioCommunicationFailures';

/** A failures consumer with the given failures active. */
function failures(active: Set<number>): RadioFailuresSource {
  return { register: () => {}, update: () => {}, isActive: (id: number) => active.has(id) };
}

/** The sim variables seen by the system, and the circuit toggles it sent. */
let simVars: Map<string, any>;
let toggles: number[];

/** The circuit toggles sent since the last reset. */
function circuitToggles(): number[] {
  return toggles;
}

describe('RadioCommunicationFailures (A32NX ATA 23 RMP and VHF failures)', () => {
  const { GetSimVarValue, SetSimVarValue } = SimVar;

  afterEach(() => {
    SimVar.GetSimVarValue = GetSimVarValue;
    SimVar.SetSimVarValue = SetSimVarValue;
  });

  beforeEach(() => {
    // all three MSFS COM circuits switched on
    simVars = new Map<string, any>([
      ['A:CIRCUIT SWITCH ON:36', 1],
      ['A:CIRCUIT SWITCH ON:38', 1],
      ['A:CIRCUIT SWITCH ON:40', 1],
    ]);
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

  it('publishes the failed RMP for the RMP instrument and model behaviours', () => {
    const active = new Set<number>([A320Failure.RadioManagementPanel1]);
    const system = new RadioCommunicationFailures(failures(active), () => 0);
    system.init();
    system.onUpdate();

    expect(SimVar.GetSimVarValue('L:A32NX_RMP_L_FAILED', 'bool')).toBe(true);
    expect(SimVar.GetSimVarValue('L:A32NX_RMP_R_FAILED', 'bool')).toBe(false);

    active.clear();
    active.add(A320Failure.RadioManagementPanel2);
    system.onUpdate();
    expect(SimVar.GetSimVarValue('L:A32NX_RMP_L_FAILED', 'bool')).toBe(false);
    expect(SimVar.GetSimVarValue('L:A32NX_RMP_R_FAILED', 'bool')).toBe(true);
  });

  it('leaves the COM circuits on without VHF failures', () => {
    const system = new RadioCommunicationFailures(failures(new Set()), () => 0);
    system.init();
    system.onUpdate();
    expect(circuitToggles()).toEqual([]);
  });

  it('switches only the MSFS COM circuit of the failed VHF off (VHF 1 = 36, VHF 2 = 38, VHF 3 = 40)', () => {
    for (const [failure, circuit] of [
      [A320Failure.Vhf1, 36],
      [A320Failure.Vhf2, 38],
      [A320Failure.Vhf3, 40],
    ]) {
      toggles = [];
      const system = new RadioCommunicationFailures(failures(new Set([failure])), () => 0);
      system.init();
      system.onUpdate();
      expect(circuitToggles()).toEqual([circuit]);
    }
  });

  it('switches the circuit back on when the VHF failure is cleared', () => {
    const active = new Set<number>([A320Failure.Vhf2]);
    let now = 0;
    const system = new RadioCommunicationFailures(failures(active), () => now);
    system.init();
    system.onUpdate();
    expect(circuitToggles()).toEqual([38]);
    // the sim applies the toggle
    simVars.set('A:CIRCUIT SWITCH ON:38', 0);
    toggles = [];

    active.clear();
    now = 100;
    system.onUpdate();
    expect(circuitToggles()).toEqual([38]);
  });
});
