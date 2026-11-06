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
const cChordPlaying = () => lvars.get('L:A32NX_ALT_DEVIATION') === true;
const tripleClickPlaying = () => lvars.get('L:A32NX_FMA_TRIPLE_CLICK') === true;
const brakeMaxBrakingPlaying = () => lvars.get('L:A32NX_AUDIO_ROP_MAX_BRAKING') === true;
const runwayTooShortPlaying = () => lvars.get('L:A32NX_AUDIO_ROW_RWY_TOO_SHORT') === true;

function createSoundManager() {
  return new FwsSoundManager(new EventBus(), Subject.create(true), Subject.create(false));
}

function runUpdates(sounds: FwsSoundManager, count: number) {
  for (let i = 0; i < count; i++) {
    sounds.onUpdate(60);
  }
}

describe('FWS continuous sounds: a more important queued sound cuts them', () => {
  it('cuts the continuous C chord for the continuous repetitive chime, and resumes it afterwards', () => {
    const sounds = createSoundManager();
    sounds.enqueueSound('cChordCont');
    runUpdates(sounds, 2);
    expect(cChordPlaying()).toBe(true);

    sounds.enqueueSound('continuousRepetitiveChime');
    runUpdates(sounds, 2);
    expect(cChordPlaying()).toBe(false);
    expect(crcPlaying()).toBe(true);

    // Several seconds later the chime still plays and the C chord still waits
    runUpdates(sounds, 300);
    expect(crcPlaying()).toBe(true);
    expect(cChordPlaying()).toBe(false);

    sounds.dequeueSound('continuousRepetitiveChime');
    runUpdates(sounds, 2);
    expect(crcPlaying()).toBe(false);
    expect(cChordPlaying()).toBe(true);
  });

  it('cuts the continuous cavalry charge for the continuous repetitive chime, and resumes it afterwards', () => {
    const sounds = createSoundManager();
    sounds.enqueueSound('cavalryChargeCont');
    runUpdates(sounds, 2);
    expect(cavalryChargePlaying()).toBe(true);

    sounds.enqueueSound('continuousRepetitiveChime');
    runUpdates(sounds, 2);
    expect(cavalryChargePlaying()).toBe(false);
    expect(crcPlaying()).toBe(true);

    sounds.dequeueSound('continuousRepetitiveChime');
    runUpdates(sounds, 2);
    expect(crcPlaying()).toBe(false);
    expect(cavalryChargePlaying()).toBe(true);
  });

  it('cuts the continuous C chord for the cavalry charge, then the C chord resumes', () => {
    const sounds = createSoundManager();
    sounds.enqueueSound('cChordCont');
    runUpdates(sounds, 2);
    expect(cChordPlaying()).toBe(true);

    sounds.enqueueSound('cavalryChargeOnce');
    runUpdates(sounds, 2);
    expect(cChordPlaying()).toBe(false);
    expect(cavalryChargePlaying()).toBe(true);

    // cavalryChargeOnce lasts 0.9 s
    runUpdates(sounds, 30);
    expect(cavalryChargePlaying()).toBe(false);
    expect(cChordPlaying()).toBe(true);
  });

  it('does not cut the continuous repetitive chime for a less important chime', () => {
    const sounds = createSoundManager();
    sounds.enqueueSound('continuousRepetitiveChime');
    runUpdates(sounds, 2);

    sounds.enqueueSound('cChordCont');
    runUpdates(sounds, 300);

    expect(crcPlaying()).toBe(true);
    expect(cChordPlaying()).toBe(false);
  });

  it('does not cut a continuous chime for a chime of the same priority', () => {
    const sounds = createSoundManager();
    sounds.enqueueSound('cChordCont');
    runUpdates(sounds, 2);

    sounds.enqueueSound('tripleClick');
    runUpdates(sounds, 300);

    expect(cChordPlaying()).toBe(true);
    expect(tripleClickPlaying()).toBe(false);
  });

  it('cuts a continuous voice for a voice with a higher priority number, and resumes it afterwards', () => {
    const sounds = createSoundManager();
    sounds.enqueueSound('runwayTooShort');
    runUpdates(sounds, 2);
    expect(runwayTooShortPlaying()).toBe(true);

    sounds.enqueueSound('minimums');
    runUpdates(sounds, 2);
    expect(runwayTooShortPlaying()).toBe(false);

    // minimums lasts 0.67 s
    runUpdates(sounds, 20);
    expect(runwayTooShortPlaying()).toBe(true);
  });

  it('cuts BRAKE MAX BRAKING for PITCH PITCH but not for a voice with a lower priority number', () => {
    const sounds = createSoundManager();
    sounds.enqueueSound('brakeMaxBraking');
    runUpdates(sounds, 2);
    expect(brakeMaxBrakingPlaying()).toBe(true);

    sounds.enqueueSound('minimums');
    runUpdates(sounds, 300);
    expect(brakeMaxBrakingPlaying()).toBe(true);

    sounds.enqueueSound('pitchPitch');
    runUpdates(sounds, 2);
    expect(brakeMaxBrakingPlaying()).toBe(false);
    expect(lvars.get('L:A32NX_FWS_AUDIO_PITCH')).toBe(true);
  });
});
