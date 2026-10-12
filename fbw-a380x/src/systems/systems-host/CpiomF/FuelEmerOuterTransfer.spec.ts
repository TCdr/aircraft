// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FuelSwitchAccess } from '@flybywiresim/fbw-sdk';
import {
  A380_EMER_OUTER_TRANSFER_VALVES,
  EMER_OUTR_TK_XFR_PB_IS_ON_VAR,
  FuelEmerOuterTransfer,
  isEmerOuterTransferCommandedOpen,
} from './FuelEmerOuterTransfer';

describe('EMER OUTR TK XFR pb-sw (A380 FCOM DSC-28-20)', () => {
  it('commands the emergency outer tank transfer valves open when ON, closed when OFF', () => {
    expect(isEmerOuterTransferCommandedOpen(true)).toBe(true);
    expect(isEmerOuterTransferCommandedOpen(false)).toBe(false);
  });

  it('drives the MSFS valves 52 and 53 (outer tank to FEED TK 1 and 4)', () => {
    expect(A380_EMER_OUTER_TRANSFER_VALVES).toEqual([52, 53]);
  });
});

describe('FuelEmerOuterTransfer', () => {
  const simVars = new Map<string, number | boolean>();
  /** The MSFS valve switches follow the commands at once; the tests read the commands */
  const commands: string[] = [];
  const valves: FuelSwitchAccess = {
    isSelected: () => false,
    setSelected: () => {},
    isSwitchOn: (index) => simVars.get(`A:FUELSYSTEM VALVE SWITCH:${index}`) === 1,
    position: (index) => (simVars.get(`A:FUELSYSTEM VALVE SWITCH:${index}`) === 1 ? 1 : 0),
    command: (index, on) => {
      commands.push(`VALVE ${index} ${on ? 'OPEN' : 'CLOSE'}`);
      simVars.set(`A:FUELSYSTEM VALVE SWITCH:${index}`, on ? 1 : 0);
    },
  };

  beforeEach(() => {
    simVars.clear();
    commands.length = 0;
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simVars.get(name) ?? 0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves the valves closed while the pb-sw is OFF', () => {
    const transfer = new FuelEmerOuterTransfer({ deltaTime: 100 }, valves);
    transfer.update(100);
    transfer.update(1000);
    expect(commands).toEqual([]);
  });

  it('opens both valves when the pb-sw is set ON and closes them when it is set OFF', () => {
    const transfer = new FuelEmerOuterTransfer({ deltaTime: 100 }, valves);
    transfer.update(100);
    simVars.set(EMER_OUTR_TK_XFR_PB_IS_ON_VAR, 1);
    transfer.update(100);
    expect(commands).toEqual(['VALVE 52 OPEN', 'VALVE 53 OPEN']);

    simVars.set(EMER_OUTR_TK_XFR_PB_IS_ON_VAR, 0);
    transfer.update(FuelEmerOuterTransfer.COMMAND_SETTLE_TIME_MS);
    expect(commands).toEqual(['VALVE 52 OPEN', 'VALVE 53 OPEN', 'VALVE 52 CLOSE', 'VALVE 53 CLOSE']);
  });

  it('opens a valve again that something else closed while the pb-sw is ON (the refuel logic)', () => {
    const transfer = new FuelEmerOuterTransfer({ deltaTime: 100 }, valves);
    simVars.set(EMER_OUTR_TK_XFR_PB_IS_ON_VAR, 1);
    transfer.update(100);
    simVars.set('A:FUELSYSTEM VALVE SWITCH:53', 0);
    transfer.update(100);
    expect(commands).toEqual(['VALVE 52 OPEN', 'VALVE 53 OPEN']);
    transfer.update(FuelEmerOuterTransfer.COMMAND_SETTLE_TIME_MS);
    expect(commands).toEqual(['VALVE 52 OPEN', 'VALVE 53 OPEN', 'VALVE 53 OPEN']);
  });
});
