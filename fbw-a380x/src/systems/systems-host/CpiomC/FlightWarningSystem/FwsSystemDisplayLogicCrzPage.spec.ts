// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, Subject } from '@microsoft/msfs-sdk';
import { SdPages } from '@shared/EcamSystemPages';
import { FwsSystemDisplayLogic } from './FwsSystemDisplayLogic';
import { FwsCore } from './FwsCore';

/** Values of the registered simvars (RegisteredSimVar reads/writes by id, which the global SimVar mock lacks) */
let simvars: Map<string, number>;
const ids: string[] = [];
const originals: Record<string, unknown> = {};

function idOf(name: string): number {
  let id = ids.indexOf(name);
  if (id < 0) {
    id = ids.push(name) - 1;
  }
  return id;
}

beforeEach(() => {
  simvars = new Map();
  originals.GetRegisteredId = SimVar.GetRegisteredId;
  originals.GetSimVarValueFastReg = SimVar.GetSimVarValueFastReg;
  originals.call = Coherent.call;
  SimVar.GetRegisteredId = (name: string) => idOf(name);
  SimVar.GetSimVarValueFastReg = (id: number) => simvars.get(ids[id]) ?? 0;
  (Coherent as any).call = (_method: string, id: number, value: number) => {
    simvars.set(ids[id], value);
    return Promise.resolve();
  };
});

afterEach(() => {
  SimVar.GetRegisteredId = originals.GetRegisteredId as typeof SimVar.GetRegisteredId;
  SimVar.GetSimVarValueFastReg = originals.GetSimVarValueFastReg as typeof SimVar.GetSimVarValueFastReg;
  (Coherent as any).call = originals.call;
  vi.restoreAllMocks();
});

/** The FWS display logic with an FwsCore stand-in that holds only what the logic reads */
function setUp() {
  const bus = new EventBus();
  const fws = {
    sub: bus.getSubscriber(),
    flightPhase: Subject.create(6),
    ecamStatusNormal: Subject.create(false),
    adrPressureAltitude: Subject.create(35000),
  };
  const logic = new FwsSystemDisplayLogic(fws as unknown as FwsCore);

  simvars.set('L:A32NX_ECAM_SFAIL', SdPages.None);
  logic.init();

  return { logic, fws };
}

describe('FwsSystemDisplayLogic automatic CRZ page in flight (phases 8-11)', () => {
  it('engine 4 alone at T.O power delays the CRZ page, as the other engines do', () => {
    const values: Record<string, number> = {
      'L:A32NX_AUTOTHRUST_TLA:4': 40,
      'ENG N1 RPM:1': 20,
      'ENG N1 RPM:2': 20,
      'ENG N1 RPM:3': 20,
      'ENG N1 RPM:4': 20,
    };
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => values[name] ?? 0);
    const { logic, fws } = setUp();
    const pageWhenUnselected = (logic as unknown as { pageWhenUnselected: Subject<SdPages> }).pageWhenUnselected;
    pageWhenUnselected.set(SdPages.Wheel);
    fws.flightPhase.set(8);

    // 0.2 s of flight phase 8
    logic.update(100);
    logic.update(100);

    // T.O power set: the CRZ page waits for its 60 s timer
    expect(pageWhenUnselected.get()).toBe(SdPages.Wheel);
  });
});
