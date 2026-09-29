// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NXDataStore } from '@flybywiresim/fbw-sdk';
import { AcarsClient } from './AcarsClient';
import { AcarsConnector } from './AcarsConnector';
import { CpdlcMessageDto } from './CpdlcMessageDto';

/** The ACARS provider (e.g. BeyondATC): not running until providerUp is set */
let providerUp = false;
let requests: CpdlcMessageDto[] = [];

/** The L:vars of the aircraft */
let lvars = new Map<string, number>();

const acarsActive = () => lvars.get('L:A32NX_ACARS_ACTIVE') ?? 0;

describe('AcarsConnector activation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    providerUp = false;
    requests = [];
    lvars = new Map();
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => lvars.get(name) ?? 0);
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation(async (name: string, _unit: string, value: number) => {
      lvars.set(name, value);
    });
    vi.spyOn(NXDataStore, 'getSetting').mockReturnValue({ get: () => 'BATC', set: vi.fn() } as any);
    vi.spyOn(AcarsClient, 'getData').mockImplementation(async (dto: CpdlcMessageDto) => {
      if (!providerUp) {
        throw new Error('error connection refused');
      }
      requests.push(dto);
      return { response: dto.type === 'ping' && dto.packet ? `ok {${dto.packet}}` : 'ok' };
    });
  });

  afterEach(() => {
    AcarsConnector.disconnect();
    AcarsConnector.deactivateAcars();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps trying after 5 minutes, once a minute, without changing the settings', async () => {
    AcarsConnector.activateAcars();
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    expect(acarsActive()).toBe(0);
    expect(NXDataStore.getSetting('ACARS_PROVIDER').set).not.toHaveBeenCalled();

    // The provider is started 6 minutes after the aircraft: active at the next attempt, within a minute
    providerUp = true;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(acarsActive()).toBe(1);
  });

  it('goes on trying after a disconnection of the flight number, and connects it when the provider answers', async () => {
    AcarsConnector.activateAcars();
    await vi.advanceTimersByTimeAsync(10_000);

    // The FMS connects the flight number (disconnect, then connect) while the provider does not answer yet
    AcarsConnector.disconnect();
    await AcarsConnector.connect('D8FBW');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(acarsActive()).toBe(0);

    providerUp = true;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(acarsActive()).toBe(1);
    // The flight number is connected: callsign check, then poll
    expect(requests.map((r) => `${r.type} ${r.from}`)).toEqual(['ping FBWA32NX', 'ping D8FBW', 'poll D8FBW']);
  });

  it('is not active any more when the provider is closed, and active again when it is started again', async () => {
    providerUp = true;
    AcarsConnector.activateAcars();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(acarsActive()).toBe(1);

    // BeyondATC closed: seen at the next check, within a minute
    providerUp = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(acarsActive()).toBe(0);

    providerUp = true;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(acarsActive()).toBe(1);
  });

  it('with a flight number, sees the provider closed at the next poll, and connects the flight number again', async () => {
    providerUp = true;
    AcarsConnector.activateAcars();
    await vi.advanceTimersByTimeAsync(1_000);
    await AcarsConnector.connect('D8FBW');
    requests = [];

    providerUp = false;
    await AcarsConnector.poll();
    expect(acarsActive()).toBe(0);

    providerUp = true;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(acarsActive()).toBe(1);
    expect(requests.map((r) => `${r.type} ${r.from}`)).toEqual(['ping FBWA32NX', 'ping D8FBW', 'poll D8FBW']);
  });
});
