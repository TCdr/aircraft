// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockRegisteredSimVars } from '../OitSpecSupport';
import { AnsuSupplies } from './AnsuLogic';
import { readAnsuSupplies } from './AircraftNetworkServerUnit';
import { readRouterSupplies, SecureInterfaceRouterUnit } from './NssRouterUnits';
import { RouterSupplies } from './NssRouterLogic';

const ANSU_BUSBARS: [keyof AnsuSupplies, string][] = [
  ['ac1', 'L:A32NX_ELEC_AC_1_BUS_IS_POWERED'],
  ['ac2', 'L:A32NX_ELEC_AC_2_BUS_IS_POWERED'],
  ['acEss', 'L:A32NX_ELEC_AC_ESS_SHED_BUS_IS_POWERED'],
  ['acEmer', 'L:A32NX_ELEC_AC_ESS_BUS_IS_POWERED'],
  ['dcHot1', 'L:A32NX_ELEC_DC_HOT_1_BUS_IS_POWERED'],
  ['dcHot2', 'L:A32NX_ELEC_DC_HOT_2_BUS_IS_POWERED'],
];

const ROUTER_BUSBARS: [keyof RouterSupplies, string][] = [
  ['ac1', 'L:A32NX_ELEC_AC_1_BUS_IS_POWERED'],
  ['ac2', 'L:A32NX_ELEC_AC_2_BUS_IS_POWERED'],
  ['acEmer', 'L:A32NX_ELEC_AC_ESS_BUS_IS_POWERED'],
  ['dc1', 'L:A32NX_ELEC_DC_1_BUS_IS_POWERED'],
  ['dc2', 'L:A32NX_ELEC_DC_2_BUS_IS_POWERED'],
];

/** The ANSU and router busbars by L:var, 1 when powered */
let busbars: Record<string, number> = {};

/** @returns the spies on the reads by name, by id and on the registrations, with every busbar unpowered */
function setUp() {
  busbars = {};
  const byName = vi.spyOn(SimVar, 'GetSimVarValue');
  const registered = mockRegisteredSimVars((name) => busbars[name] ?? 0);
  return { byName, ...registered };
}

describe('ANSU busbar reads', () => {
  afterEach(() => vi.restoreAllMocks());

  it('read through registered ids, with no read by name', () => {
    const { byName, reads } = setUp();
    for (let frame = 0; frame < 20; frame++) {
      readAnsuSupplies();
    }
    expect(byName).not.toHaveBeenCalled();
    expect(reads).toHaveBeenCalledTimes(20 * ANSU_BUSBARS.length);
  });

  it('give the same object back while nothing changes, and when a busbar does', () => {
    setUp();
    const first = readAnsuSupplies();
    expect(readAnsuSupplies()).toBe(first);
    busbars['L:A32NX_ELEC_AC_1_BUS_IS_POWERED'] = 1;
    expect(readAnsuSupplies()).toBe(first);
  });

  it('register each busbar once, however often it is read', () => {
    const { registrations } = setUp();
    for (let frame = 0; frame < 20; frame++) {
      readAnsuSupplies();
    }
    const namesRegistered = registrations.mock.calls.map(([name]) => name);
    // a previous test in the file may have registered the busbars already
    expect(namesRegistered.length).toBeLessThanOrEqual(ANSU_BUSBARS.length);
    expect(new Set(namesRegistered).size).toBe(namesRegistered.length);
  });

  it.each(ANSU_BUSBARS)('%s follows its busbar and no other', (supply, simVarName) => {
    setUp();
    expect(readAnsuSupplies()).toEqual({
      ac1: false,
      ac2: false,
      acEss: false,
      acEmer: false,
      dcHot1: false,
      dcHot2: false,
    });
    busbars[simVarName] = 1;
    const supplies = readAnsuSupplies();
    for (const [other] of ANSU_BUSBARS) {
      expect(supplies[other]).toBe(other === supply);
    }
    busbars[simVarName] = 0;
    expect(readAnsuSupplies()[supply]).toBe(false);
  });
});

describe('NSS router busbar reads', () => {
  afterEach(() => vi.restoreAllMocks());

  it('read through registered ids, with no read by name', () => {
    const { byName, reads } = setUp();
    for (let frame = 0; frame < 20; frame++) {
      readRouterSupplies();
    }
    expect(byName).not.toHaveBeenCalled();
    expect(reads).toHaveBeenCalledTimes(20 * ROUTER_BUSBARS.length);
  });

  it('give the same object back while nothing changes, and when a busbar does', () => {
    setUp();
    const first = readRouterSupplies();
    expect(readRouterSupplies()).toBe(first);
    busbars['L:A32NX_ELEC_DC_1_BUS_IS_POWERED'] = 1;
    expect(readRouterSupplies()).toBe(first);
  });

  it('register each busbar once, however often it is read', () => {
    const { registrations } = setUp();
    for (let frame = 0; frame < 20; frame++) {
      readRouterSupplies();
    }
    const namesRegistered = registrations.mock.calls.map(([name]) => name);
    expect(namesRegistered.length).toBeLessThanOrEqual(ROUTER_BUSBARS.length);
    expect(new Set(namesRegistered).size).toBe(namesRegistered.length);
  });

  it.each(ROUTER_BUSBARS)('%s follows its busbar and no other', (supply, simVarName) => {
    setUp();
    expect(readRouterSupplies()).toEqual({ ac1: false, ac2: false, acEmer: false, dc1: false, dc2: false });
    busbars[simVarName] = 1;
    const supplies = readRouterSupplies();
    for (const [other] of ROUTER_BUSBARS) {
      expect(supplies[other]).toBe(other === supply);
    }
    busbars[simVarName] = 0;
    expect(readRouterSupplies()[supply]).toBe(false);
  });

  it('a router unit takes its supply from the busbars read by id', () => {
    const { byName } = setUp();
    const siru = new SecureInterfaceRouterUnit(new EventBus());
    siru.init();
    busbars['L:A32NX_ELEC_AC_1_BUS_IS_POWERED'] = 1;
    busbars['L:A32NX_ELEC_DC_1_BUS_IS_POWERED'] = 1;
    siru.onUpdate();
    expect(siru.powered.get()).toBe(true);
    expect(byName.mock.calls.filter(([name]) => String(name).includes('BUS_IS_POWERED'))).toEqual([]);
  });
});
