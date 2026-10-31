// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { LegacyGpws } from './LegacyGpws';
import { LegacySoundManager, soundList } from './LegacySoundManager';

/*
 * The sound manager plays one sound at a time; when several periodic sounds are due the one of the highest priority
 * plays (PULL UP > TERRAIN > TOO LOW > SINK RATE > GLIDE SLOPE).
 */
describe('LegacySoundManager priorities', () => {
  let played: string[];

  beforeEach(() => {
    played = [];
    vi.stubGlobal('Coherent', {
      call: (_: string, name: string) => {
        played.push(name);
        return Promise.resolve();
      },
    });
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Runs the manager for the seconds, in steps of 0.1 s */
  const run = (soundManager: LegacySoundManager, seconds: number) => {
    for (let i = 0; i < seconds * 10; i++) {
      soundManager.update(100);
    }
  };

  const count = (name: string) => played.filter((playedName) => playedName === name).length;

  const gpwsWith = (soundManager: LegacySoundManager, modeStates: Record<number, number>) => {
    const gpws = new LegacyGpws(new EventBus(), soundManager);
    for (const index of Object.keys(modeStates).map(Number)) {
      gpws.modes[index].current = modeStates[index];
    }
    gpws.GPWSComputeLightsAndCallouts();
    return gpws;
  };

  it('GLIDE SLOPE alone repeats, with a pause between the repeats', () => {
    const soundManager = new LegacySoundManager();
    gpwsWith(soundManager, { 4: 1 });
    run(soundManager, 10);
    expect(count(soundList.glideslope_quiet.name)).toBeGreaterThanOrEqual(4);
    expect(soundManager.periodicList[0].period).toBeGreaterThan(soundList.glideslope_quiet.length);
  });

  it('PULL UP (mode 1) plays and GLIDE SLOPE waits', () => {
    const soundManager = new LegacySoundManager();
    gpwsWith(soundManager, { 4: 1, 0: 2 });
    run(soundManager, 10);
    expect(count(soundList.pull_up.name)).toBeGreaterThanOrEqual(3);
    expect(count(soundList.glideslope_quiet.name)).toBe(0);
  });

  it('SINK RATE plays before GLIDE SLOPE', () => {
    const soundManager = new LegacySoundManager();
    gpwsWith(soundManager, { 4: 1, 0: 1 });
    run(soundManager, 10);
    expect(count(soundList.sink_rate.name)).toBeGreaterThanOrEqual(3);
    expect(count(soundList.glideslope_quiet.name)).toBe(0);
  });

  it('TOO LOW TERRAIN plays before SINK RATE, TERRAIN before TOO LOW TERRAIN', () => {
    const soundManager = new LegacySoundManager();
    gpwsWith(soundManager, { 0: 1, 3: 3 });
    run(soundManager, 10);
    expect(count(soundList.too_low_terrain.name)).toBeGreaterThanOrEqual(3);
    expect(count(soundList.sink_rate.name)).toBe(0);

    played = [];
    const second = new LegacySoundManager();
    gpwsWith(second, { 1: 1, 3: 3 });
    run(second, 10);
    expect(count(soundList.terrain.name)).toBeGreaterThanOrEqual(3);
    expect(count(soundList.too_low_terrain.name)).toBe(0);
  });

  it('GLIDE SLOPE plays again once PULL UP ends', () => {
    const soundManager = new LegacySoundManager();
    const gpws = gpwsWith(soundManager, { 4: 1, 0: 2 });
    run(soundManager, 5);
    gpws.modes[0].current = 0;
    gpws.GPWSComputeLightsAndCallouts();
    run(soundManager, 5);
    expect(count(soundList.glideslope_quiet.name)).toBeGreaterThanOrEqual(2);
  });
});
