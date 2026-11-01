// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, Subject } from '@microsoft/msfs-sdk';
import { FwsSoundManager } from './FwsSoundManager';

/** The last value written to each L:var by the sound manager */
let lvars: Map<string, unknown>;

beforeEach(() => {
  lvars = new Map();
  vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: unknown) => {
    lvars.set(name, value);
    return Promise.resolve();
  });
});

const crcPlaying = () => lvars.get('L:A32NX_FWC_CRC') === true;
const cavalryChargePlaying = () => lvars.get('L:A32NX_FWC_CAVALRY_CHARGE') === true;

function createSoundManager() {
  const audioFunctionLost = Subject.create(false);
  const sounds = new FwsSoundManager(new EventBus(), Subject.create(true), audioFunctionLost);

  // An update that never ends would hang the test run, so a runaway loop fails the test instead
  const stopCurrentSound = (sounds as any).stopCurrentSound.bind(sounds);
  let stopAttempts = 0;
  vi.spyOn(sounds as any, 'stopCurrentSound').mockImplementation((...args: unknown[]) => {
    if (++stopAttempts > 1_000) {
      throw new Error('onUpdate keeps trying to stop a sound that cannot be stopped');
    }
    return stopCurrentSound(...args);
  });

  return { sounds, audioFunctionLost };
}

describe('FWS audio function lost', () => {
  it('stops a continuous sound at once', () => {
    const { sounds, audioFunctionLost } = createSoundManager();
    sounds.handleSoundCondition('continuousRepetitiveChime', true);
    sounds.onUpdate(60);
    expect(crcPlaying()).toBe(true);

    audioFunctionLost.set(true);
    sounds.onUpdate(60);

    expect(crcPlaying()).toBe(false);
  });

  it('lets a sound that cannot be stopped play to its end, without looping', () => {
    const { sounds, audioFunctionLost } = createSoundManager();
    sounds.handleSoundCondition('cavalryChargeOnce', true);
    sounds.onUpdate(60);
    expect(cavalryChargePlaying()).toBe(true);

    audioFunctionLost.set(true);
    sounds.onUpdate(60);
    expect(cavalryChargePlaying()).toBe(true);

    // cavalryChargeOnce lasts 0.9 s
    for (let elapsedMs = 120; elapsedMs <= 1_200; elapsedMs += 60) {
      sounds.onUpdate(60);
    }
    expect(cavalryChargePlaying()).toBe(false);
  });

  it('does not start a queued sound after the loss', () => {
    const { sounds, audioFunctionLost } = createSoundManager();
    sounds.handleSoundCondition('cavalryChargeOnce', true);
    sounds.onUpdate(60);
    sounds.handleSoundCondition('continuousRepetitiveChime', true);

    audioFunctionLost.set(true);
    for (let elapsedMs = 0; elapsedMs <= 2_000; elapsedMs += 60) {
      sounds.onUpdate(60);
    }

    expect(cavalryChargePlaying()).toBe(false);
    expect(crcPlaying()).toBe(false);
  });
});
