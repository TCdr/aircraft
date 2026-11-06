// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const stallPlaying = () => lvars.get('L:A32NX_AUDIO_STALL_WARNING') === true;
const runwayTooShortPlaying = () => lvars.get('L:A32NX_AUDIO_ROW_RWY_TOO_SHORT') === true;

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

describe('Stall warning aural', () => {
  // The Wwise callouts start through Coherent
  beforeEach(() => vi.stubGlobal('Coherent', { call: () => Promise.resolve() }));
  afterEach(() => vi.unstubAllGlobals());

  const runFor = (sounds: FwsSoundManager, steps: number) => {
    for (let step = 0; step < steps; step++) {
      sounds.onUpdate(60);
    }
  };

  it('plays the stall warning sound, not BRAKE MAX BRAKING', () => {
    const { sounds } = createSoundManager();
    sounds.handleSoundCondition('stall', true);
    sounds.onUpdate(60);

    expect(stallPlaying()).toBe(true);
    expect(lvars.get('L:A32NX_AUDIO_ROP_MAX_BRAKING')).not.toBe(true);
  });

  it('cuts RWY TOO SHORT, which sounds again after the stall', () => {
    const { sounds } = createSoundManager();
    sounds.handleSoundCondition('runwayTooShort', true);
    sounds.onUpdate(60);
    expect(runwayTooShortPlaying()).toBe(true);

    sounds.handleSoundCondition('stall', true);
    runFor(sounds, 2);
    expect(stallPlaying()).toBe(true);
    expect(runwayTooShortPlaying()).toBe(false);

    sounds.handleSoundCondition('stall', false);
    runFor(sounds, 2);
    expect(runwayTooShortPlaying()).toBe(true);
  });

  it('plays before the queued voices and callouts', () => {
    const { sounds } = createSoundManager();
    sounds.enqueueSound('v1');
    sounds.onUpdate(60);
    for (const aural of ['windshear', 'retard', 'minimums', 'pitchPitch']) {
      sounds.enqueueSound(aural);
    }
    sounds.handleSoundCondition('stall', true);
    runFor(sounds, 25);

    expect(stallPlaying()).toBe(true);
    expect(lvars.get('L:A32NX_FWS_AUDIO_WINDSHEAR')).not.toBe(true);
  });

  it('waits for a playing one-shot to end', () => {
    const { sounds } = createSoundManager();
    sounds.enqueueSound('v1');
    sounds.onUpdate(60);
    sounds.handleSoundCondition('stall', true);

    // v1 lasts 1.3 s
    runFor(sounds, 10);
    expect(stallPlaying()).toBe(false);
    runFor(sounds, 15);
    expect(stallPlaying()).toBe(true);
  });

  it('cuts the cavalry charge, which sounds again after the stall', () => {
    const { sounds } = createSoundManager();
    sounds.enqueueSound('cavalryChargeCont');
    sounds.onUpdate(60);
    expect(cavalryChargePlaying()).toBe(true);

    sounds.handleSoundCondition('stall', true);
    runFor(sounds, 2);
    expect(cavalryChargePlaying()).toBe(false);
    expect(stallPlaying()).toBe(true);

    sounds.handleSoundCondition('stall', false);
    runFor(sounds, 2);
    expect(cavalryChargePlaying()).toBe(true);
  });
});
