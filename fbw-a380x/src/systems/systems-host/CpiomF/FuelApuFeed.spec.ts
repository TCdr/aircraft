// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSimVars } from '../../../../../fbw-common/src/jest/MockedSimVars';
import { FuelSwitchAccess } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import {
  APU_FEED_ABNORMALLY_CLOSED_VAR,
  APU_FEED_ABNORMALLY_OPEN_VAR,
  APU_ISOLATION_VALVE,
  APU_LP_VALVE,
  ApuFeedMonitor,
  areApuFeedValvesCommandedOpen,
  FuelApuFeed,
} from './FuelApuFeed';

describe('A380 APU feed valve command', () => {
  it('opens both valves with the APU MASTER pb-sw ON only', () => {
    expect(areApuFeedValvesCommandedOpen(true, false)).toBe(true);
    expect(areApuFeedValvesCommandedOpen(false, false)).toBe(false);
  });

  it('closes both valves when the APU FIRE pb is pushed', () => {
    expect(areApuFeedValvesCommandedOpen(true, true)).toBe(false);
  });
});

describe('A380 APU feed valve monitoring', () => {
  it('finds a valve abnormally closed after 5 s with the valves commanded open', () => {
    const monitor = new ApuFeedMonitor();
    expect(monitor.update(true, 1, 0, 4.9).abnormallyClosed).toBe(false);
    expect(monitor.update(true, 1, 0, 0.2)).toEqual({ abnormallyClosed: true, abnormallyOpen: false });
  });

  it('finds a valve abnormally open after 5 s with the valves commanded closed', () => {
    const monitor = new ApuFeedMonitor();
    expect(monitor.update(false, 0, 1, 5)).toEqual({ abnormallyClosed: false, abnormallyOpen: true });
  });

  it('does not flag the valves while they travel (3 s)', () => {
    const monitor = new ApuFeedMonitor();
    expect(monitor.update(true, 0, 0, 3)).toEqual({ abnormallyClosed: false, abnormallyOpen: false });
    expect(monitor.update(true, 1, 1, 3)).toEqual({ abnormallyClosed: false, abnormallyOpen: false });
  });
});

describe('A380 APU feed valves and their jams', () => {
  const simVars = new Map<string, number | boolean>();
  const failures = new Set<number>();
  /** The MSFS valves follow their switch at once */
  const valves: FuelSwitchAccess = {
    isSelected: () => false,
    setSelected: () => {},
    isSwitchOn: (valve) => simVars.get(`A:FUELSYSTEM VALVE SWITCH:${valve}`) === 1,
    position: (valve) => Number(simVars.get(`A:FUELSYSTEM VALVE OPEN:${valve}`) ?? 0),
    command: (valve, open) => {
      simVars.set(`A:FUELSYSTEM VALVE SWITCH:${valve}`, open ? 1 : 0);
      simVars.set(`A:FUELSYSTEM VALVE OPEN:${valve}`, open ? 1 : 0);
    },
  };
  let feed: FuelApuFeed;

  /** Runs the module for some seconds, 1 s per update */
  const run = (seconds: number) => {
    for (let s = 0; s < seconds; s++) {
      feed.onUpdate();
    }
  };

  beforeEach(() => {
    simVars.clear();
    failures.clear();
    mockSimVars(simVars);
    // The flight files leave both valves open
    for (const valve of [APU_ISOLATION_VALVE, APU_LP_VALVE]) {
      simVars.set(`A:FUELSYSTEM VALVE SWITCH:${valve}`, 1);
      simVars.set(`A:FUELSYSTEM VALVE OPEN:${valve}`, 1);
    }
    feed = new FuelApuFeed({ deltaTime: 1000 }, { isActive: (failure) => failures.has(failure) }, valves);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('closes the valves with the APU MASTER pb-sw OFF and opens them with it ON', () => {
    run(2);
    expect(simVars.get(`A:FUELSYSTEM VALVE OPEN:${APU_LP_VALVE}`)).toBe(0);
    simVars.set('L:A32NX_OVHD_APU_MASTER_SW_PB_IS_ON', 1);
    run(2);
    expect(simVars.get(`A:FUELSYSTEM VALVE OPEN:${APU_ISOLATION_VALVE}`)).toBe(1);
    expect(simVars.get(`A:FUELSYSTEM VALVE OPEN:${APU_LP_VALVE}`)).toBe(1);
    run(10);
    expect(simVars.get(APU_FEED_ABNORMALLY_CLOSED_VAR)).toBe(false);
    expect(simVars.get(APU_FEED_ABNORMALLY_OPEN_VAR)).toBe(false);
  });

  it('APU FEED FAULT: an LP valve jammed closed stays closed with the APU MASTER pb-sw ON', () => {
    run(2);
    failures.add(A380Failure.FuelApuLpValveJammed);
    simVars.set('L:A32NX_OVHD_APU_MASTER_SW_PB_IS_ON', 1);
    run(10);
    expect(simVars.get(`A:FUELSYSTEM VALVE OPEN:${APU_LP_VALVE}`)).toBe(0);
    expect(simVars.get(APU_FEED_ABNORMALLY_CLOSED_VAR)).toBe(true);
  });

  it('APU FEED VLV NOT CLOSED: an isolation valve jammed open stays open with the APU MASTER pb-sw OFF', () => {
    simVars.set('L:A32NX_OVHD_APU_MASTER_SW_PB_IS_ON', 1);
    run(2);
    failures.add(A380Failure.FuelApuIsolationValveJammed);
    simVars.set('L:A32NX_OVHD_APU_MASTER_SW_PB_IS_ON', 0);
    run(10);
    expect(simVars.get(`A:FUELSYSTEM VALVE OPEN:${APU_ISOLATION_VALVE}`)).toBe(1);
    expect(simVars.get(APU_FEED_ABNORMALLY_OPEN_VAR)).toBe(true);
  });
});
