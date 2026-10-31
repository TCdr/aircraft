// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  isAvncsRouterSupplied,
  isSiruSupplied,
  nssRouterState,
  nssRouterStateLabel,
  RouterSupplies,
  SupplyHoldUp,
} from './NssRouterLogic';

const none: RouterSupplies = { ac1: false, ac2: false, acEmer: false, dc1: false, dc2: false };
const only = (...supplies: (keyof RouterSupplies)[]): RouterSupplies =>
  supplies.reduce((all, supply) => ({ ...all, [supply]: true }), none);

describe('NSS AVNCS router supply', () => {
  it('ARU 1 needs AC 2 and DC 2', () => {
    expect(isAvncsRouterSupplied(1, only('ac2', 'dc2'))).toBe(true);
    expect(isAvncsRouterSupplied(1, only('ac2'))).toBe(false);
    expect(isAvncsRouterSupplied(1, only('dc2'))).toBe(false);
    expect(isAvncsRouterSupplied(1, only('ac1', 'dc1'))).toBe(false);
  });

  it('ARU 2 needs AC 1 or AC EMER, and DC 1', () => {
    expect(isAvncsRouterSupplied(2, only('ac1', 'dc1'))).toBe(true);
    expect(isAvncsRouterSupplied(2, only('acEmer', 'dc1'))).toBe(true);
    expect(isAvncsRouterSupplied(2, only('ac1'))).toBe(false);
    expect(isAvncsRouterSupplied(2, only('acEmer'))).toBe(false);
    expect(isAvncsRouterSupplied(2, only('dc1'))).toBe(false);
    expect(isAvncsRouterSupplied(2, only('ac2', 'dc2'))).toBe(false);
  });

  it('the SIRU needs AC 1 and DC 1', () => {
    expect(isSiruSupplied(only('ac1', 'dc1'))).toBe(true);
    expect(isSiruSupplied(only('ac1'))).toBe(false);
    expect(isSiruSupplied(only('dc1'))).toBe(false);
    expect(isSiruSupplied(only('acEmer', 'dc1'))).toBe(false);
  });
});

describe('SupplyHoldUp', () => {
  it('is not supplied before the supply was ever present', () => {
    const holdUp = new SupplyHoldUp();
    expect(holdUp.update(false, 1_000)).toBe(false);
    expect(holdUp.update(false, 100_000)).toBe(false);
  });

  it('counts an assumed supply as supplied until the supply was present once', () => {
    const holdUp = new SupplyHoldUp();
    expect(holdUp.update(false, 1_000, true)).toBe(true);
    expect(holdUp.update(false, 100_000, true)).toBe(true);
    expect(holdUp.update(false, 100_500, false)).toBe(false);
  });

  it('does not assume the supply again after it was present and lost', () => {
    const holdUp = new SupplyHoldUp();
    holdUp.update(true, 1_000, true);
    expect(holdUp.update(false, 2_000, true)).toBe(true);
    expect(holdUp.update(false, 2_000 + SupplyHoldUp.HOLD_MS, true)).toBe(false);
    expect(holdUp.update(false, 100_000, true)).toBe(false);
  });

  it('keeps the unit supplied through a short loss, and drops it once the loss lasts HOLD_MS', () => {
    const holdUp = new SupplyHoldUp();
    expect(holdUp.update(true, 1_000)).toBe(true);
    expect(holdUp.update(false, 2_000)).toBe(true);
    expect(holdUp.update(false, 2_000 + SupplyHoldUp.HOLD_MS - 1)).toBe(true);
    expect(holdUp.update(false, 2_000 + SupplyHoldUp.HOLD_MS)).toBe(false);
  });

  it('restarts the loss timer after the supply came back', () => {
    const holdUp = new SupplyHoldUp();
    holdUp.update(true, 1_000);
    holdUp.update(false, 2_000);
    expect(holdUp.update(true, 8_000)).toBe(true);
    expect(holdUp.update(false, 9_000)).toBe(true);
    expect(holdUp.update(false, 9_000 + SupplyHoldUp.HOLD_MS - 1)).toBe(true);
    expect(holdUp.update(false, 9_000 + SupplyHoldUp.HOLD_MS)).toBe(false);
  });

  it('stays dropped until the supply is present again', () => {
    const holdUp = new SupplyHoldUp();
    holdUp.update(true, 1_000);
    holdUp.update(false, 2_000);
    expect(holdUp.update(false, 100_000)).toBe(false);
    expect(holdUp.update(false, 200_000)).toBe(false);
    expect(holdUp.update(true, 300_000)).toBe(true);
  });

  it('does not count the placeholder time 0 of the clock before its first event as a time without supply', () => {
    const holdUp = new SupplyHoldUp();
    expect(holdUp.update(true, 0)).toBe(true);
    expect(holdUp.update(false, 0)).toBe(true);
    expect(holdUp.update(false, 5_000_000)).toBe(true);
    expect(holdUp.update(false, 5_000_000 + SupplyHoldUp.HOLD_MS)).toBe(false);
  });
});

describe('router state on the NSS AVNCS units page', () => {
  it('is off without supply, starting until the start is over, then operating', () => {
    expect(nssRouterState(false, false)).toBe('off');
    expect(nssRouterState(false, true)).toBe('off');
    expect(nssRouterState(true, false)).toBe('starting');
    expect(nssRouterState(true, true)).toBe('operating');
    expect(nssRouterStateLabel('off')).toBe('OFF');
    expect(nssRouterStateLabel('starting')).toBe('STARTING');
    expect(nssRouterStateLabel('operating')).toBe('OPERATING');
  });
});
