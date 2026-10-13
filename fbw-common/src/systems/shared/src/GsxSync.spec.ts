// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, SimVarValueType } from '@microsoft/msfs-sdk';
import { GsxServiceStates, GsxSyncA32NX } from './GsxSync';

/** The extras host instance, with its in-game subscriptions made at once (no game state in the tests) */
class TestGsxSync extends GsxSyncA32NX {
  public startInGame(): void {
    this.initSubscriptions();
    this.subscriptionsReady = true;
  }
}

describe('GsxSync external power sync turned on in the flyPad', () => {
  /** The sim data store, as the flyPad writes it (NXDataStore.setLegacy) */
  let storedData: Record<string, string>;
  let now: number;
  /** The writes to the sim variables */
  let setSimVarValue: ReturnType<typeof vi.fn>;
  let originalSetSimVarValue: unknown;

  beforeEach(() => {
    storedData = {};
    now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    (global as any).GetStoredData = (key: string) => storedData[key] ?? '';
    // The flyPad's FBW_NXDATASTORE_UPDATE event does not reach the extras host: the Coherent.on mock never calls back
    originalSetSimVarValue = (global as any).SimVar.SetSimVarValue;
    setSimVarValue = vi.fn(() => Promise.resolve());
    (global as any).SimVar.SetSimVarValue = setSimVarValue;
  });

  afterEach(() => {
    (global as any).SimVar.SetSimVarValue = originalSetSimVarValue;
    vi.restoreAllMocks();
  });

  const extPowerWrites = () => setSimVarValue.mock.calls.filter(([name]) => name === 'L:A32NX_EXT_PWR_AVAIL:1');

  function createWithGsxGpuConnected(): TestGsxSync {
    const bus = new EventBus();
    const sync = new TestGsxSync(bus);
    // GSX GPU connected (FSDT_GSX_GPU_STATE 5) before the sync is enabled, no pushback
    bus.getPublisher<any>().pub('gsx_gpu_state', GsxServiceStates.ACTIVE, false, true);
    bus.getPublisher<any>().pub('gsx_jetway_state', GsxServiceStates.CALLABLE, false, true);
    bus.getPublisher<any>().pub('gsx_departure_state', GsxServiceStates.CALLABLE, false, true);
    sync.startInGame();
    sync.onUpdate();
    return sync;
  }

  it('makes EXT PWR available at once when the setting is turned on with the GSX GPU already connected', () => {
    const sync = createWithGsxGpuConnected();
    expect(extPowerWrites()).toHaveLength(0);

    storedData.A32NX_GSX_POWER_SYNC = '1';
    now += 1000;
    sync.onUpdate();

    expect(extPowerWrites()).toEqual([['L:A32NX_EXT_PWR_AVAIL:1', SimVarValueType.Bool, true]]);
  });

  it('evaluates once per turn-on, not on every read while the setting stays on', () => {
    const sync = createWithGsxGpuConnected();
    storedData.A32NX_GSX_POWER_SYNC = '1';
    for (let i = 0; i < 5; i++) {
      now += 1000;
      sync.onUpdate();
    }
    expect(extPowerWrites()).toHaveLength(1);

    // off, then on again: evaluated again
    storedData.A32NX_GSX_POWER_SYNC = '0';
    now += 1000;
    sync.onUpdate();
    storedData.A32NX_GSX_POWER_SYNC = '1';
    now += 1000;
    sync.onUpdate();
    expect(extPowerWrites()).toHaveLength(2);
  });

  it('reads the stored setting at most once a second', () => {
    const sync = createWithGsxGpuConnected();
    storedData.A32NX_GSX_POWER_SYNC = '1';
    now += 500;
    sync.onUpdate();
    expect(extPowerWrites()).toHaveLength(0);
    now += 500;
    sync.onUpdate();
    expect(extPowerWrites()).toHaveLength(1);
  });
});
