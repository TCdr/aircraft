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
    simVars = new Map<string, any>();
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
    const system = new NavigationReceiverFailures(failures(active));
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
  });

  it('publishes ILS 1 failed without ever switching the MSFS NAV 3 radio off, so that ILS 2 keeps its data', () => {
    const active = new Set<number>([A320Failure.Ils1Receiver]);
    const system = new NavigationReceiverFailures(failures(active));
    system.init();
    system.onUpdate();
    system.onUpdate();
    expect(simVars.get('L:A32NX_ILS_1_FAILED')).toBe(true);
    expect(simVars.get('L:A32NX_ILS_2_FAILED')).toBe(false);
    expect(toggles).toEqual([]);

    active.clear();
    system.onUpdate();
    expect(simVars.get('L:A32NX_ILS_1_FAILED')).toBe(false);
    expect(toggles).toEqual([]);
  });

  it('publishes the GLS of a receiver failed for its GLS function only, not for its ILS receiver', () => {
    const active = new Set<number>([A320Failure.Gls1Function, A320Failure.Ils2Receiver]);
    const system = new NavigationReceiverFailures(failures(active));
    system.init();
    system.onUpdate();
    expect(simVars.get('L:A32NX_GLS_1_FAILED')).toBe(true);
    expect(simVars.get('L:A32NX_GLS_2_FAILED')).toBe(false);
    expect(simVars.get('L:A32NX_ILS_2_FAILED')).toBe(true);

    active.clear();
    active.add(A320Failure.Gls2Function);
    system.onUpdate();
    expect(simVars.get('L:A32NX_GLS_1_FAILED')).toBe(false);
    expect(simVars.get('L:A32NX_GLS_2_FAILED')).toBe(true);
    // the GLS function failure leaves the ILS of the same receiver alone
    expect(simVars.get('L:A32NX_ILS_2_FAILED')).toBe(false);
  });

  it('publishes the failure of the GBAS ground station', () => {
    const active = new Set<number>([A320Failure.GbasGroundStation]);
    const system = new NavigationReceiverFailures(failures(active));
    system.init();
    system.onUpdate();
    expect(simVars.get('L:A32NX_GBAS_STATION_FAILED')).toBe(true);
    expect(simVars.get('L:A32NX_GLS_1_FAILED')).toBe(false);

    active.clear();
    system.onUpdate();
    expect(simVars.get('L:A32NX_GBAS_STATION_FAILED')).toBe(false);
  });
});
