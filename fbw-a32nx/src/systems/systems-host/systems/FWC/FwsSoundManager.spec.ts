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

describe('FWS aurals without FWC', () => {
  it('plays the aurals once the FWC startup is completed', () => {
    const fwsAvailable = Subject.create(true);
    const sounds = new FwsSoundManager(new EventBus(), fwsAvailable);

    sounds.handleSoundCondition('continuousRepetitiveChime', true);
    sounds.onUpdate(60);

    expect(sounds.getCurrentSoundPlaying()).toBe('continuousRepetitiveChime');
    expect(crcPlaying()).toBe(true);
  });

  it('stops the continuous chime being played and forgets the pending aurals when no FWC is left', () => {
    const fwsAvailable = Subject.create(true);
    const sounds = new FwsSoundManager(new EventBus(), fwsAvailable);

    sounds.handleSoundCondition('continuousRepetitiveChime', true);
    sounds.onUpdate(60);
    expect(crcPlaying()).toBe(true);

    sounds.enqueueSound('cavalryCharge');
    fwsAvailable.set(false);
    expect(crcPlaying()).toBe(false);
    expect(sounds.getCurrentSoundPlaying()).toBe(null);

    // An FWC works again: the aurals lost meanwhile are not played late
    fwsAvailable.set(true);
    sounds.onUpdate(60);
    expect(sounds.getCurrentSoundPlaying()).toBe(null);
    expect(lvars.get('L:A32NX_FWC_CAVALRY_CHARGE')).not.toBe(true);
  });

  it('does not play the single chimes asked for while the FWC starts up as a backlog', () => {
    const fwsAvailable = Subject.create(false);
    const sounds = new FwsSoundManager(new EventBus(), fwsAvailable);

    // Power-up: six cautions come and go while the FWC is still starting up
    for (let i = 0; i < 6; i++) {
      sounds.enqueueSound('singleChime');
    }
    fwsAvailable.set(true);

    let chimes = 0;
    for (let i = 0; i < 20; i++) {
      sounds.onUpdate(600);
      if (sounds.getCurrentSoundPlaying() === 'singleChime' && lvars.get('L:A32NX_FWC_SC') === true) {
        chimes++;
        lvars.set('L:A32NX_FWC_SC', false);
      }
    }
    expect(chimes).toBe(0);
  });
});

describe('FWS aurals while the stall sounds', () => {
  it('stops the continuous chime and plays it again after the stall', () => {
    const sounds = new FwsSoundManager(new EventBus(), Subject.create(true));

    sounds.handleSoundCondition('continuousRepetitiveChime', true);
    sounds.onUpdate(60);
    expect(crcPlaying()).toBe(true);

    sounds.setAuralsInhibited(true);
    sounds.onUpdate(60);
    expect(crcPlaying()).toBe(false);
    expect(sounds.getCurrentSoundPlaying()).toBe(null);

    for (let i = 0; i < 10; i++) {
      sounds.onUpdate(600);
      expect(crcPlaying()).toBe(false);
    }

    sounds.setAuralsInhibited(false);
    sounds.onUpdate(60);
    expect(crcPlaying()).toBe(true);
  });

  it('starts no aural while the stall sounds', () => {
    const sounds = new FwsSoundManager(new EventBus(), Subject.create(true));

    sounds.setAuralsInhibited(true);
    sounds.enqueueSound('cavalryCharge');
    sounds.handleSoundCondition('cChordCont', true);
    sounds.enqueueSound('singleChime');
    for (let i = 0; i < 20; i++) {
      sounds.onUpdate(600);
      expect(lvars.get('L:A32NX_FWC_CAVALRY_CHARGE')).not.toBe(true);
      expect(lvars.get('L:A32NX_FWC_CCHORD')).not.toBe(true);
      expect(lvars.get('L:A32NX_FWC_SC')).not.toBe(true);
    }

    sounds.setAuralsInhibited(false);
    sounds.onUpdate(60);
    expect(sounds.getCurrentSoundPlaying()).toBe('cavalryCharge');
  });

  it('lets a one-shot voice end and holds its repeats until the stall ends', () => {
    const sounds = new FwsSoundManager(new EventBus(), Subject.create(true));

    sounds.enqueueSound('speedSpeedSpeed');
    sounds.onUpdate(60);
    expect(lvars.get('L:A32NX_FWS_AUDIO_SPEED')).toBe(true);

    sounds.setAuralsInhibited(true);
    sounds.onUpdate(600);
    expect(lvars.get('L:A32NX_FWS_AUDIO_SPEED')).toBe(false);
    for (let i = 0; i < 5; i++) {
      sounds.onUpdate(600);
      expect(lvars.get('L:A32NX_FWS_AUDIO_SPEED')).toBe(false);
    }

    sounds.setAuralsInhibited(false);
    sounds.onUpdate(60);
    expect(lvars.get('L:A32NX_FWS_AUDIO_SPEED')).toBe(true);
  });
});

describe('FWS aurals: a more important sound cuts a continuous one', () => {
  const lvarOn = (name: string) => lvars.get(`L:${name}`) === true;

  const startPlaying = (sounds: FwsSoundManager, soundKey: 'cChordCont' | 'continuousRepetitiveChime') => {
    sounds.handleSoundCondition(soundKey, true);
    sounds.onUpdate(60);
    expect(sounds.getCurrentSoundPlaying()).toBe(soundKey);
  };

  it('cuts the continuous C chord for the continuous repetitive chime and plays the C chord again afterwards', () => {
    const sounds = new FwsSoundManager(new EventBus(), Subject.create(true));
    startPlaying(sounds, 'cChordCont');
    expect(lvarOn('A32NX_FWC_CCHORD')).toBe(true);

    sounds.handleSoundCondition('continuousRepetitiveChime', true);
    sounds.onUpdate(60);
    sounds.onUpdate(60);
    expect(lvarOn('A32NX_FWC_CCHORD')).toBe(false);
    expect(lvarOn('A32NX_FWC_CRC')).toBe(true);
    expect(sounds.getCurrentSoundPlaying()).toBe('continuousRepetitiveChime');

    // The chime is not cut back by the chord it replaced
    for (let i = 0; i < 10; i++) {
      sounds.onUpdate(600);
      expect(lvarOn('A32NX_FWC_CRC')).toBe(true);
      expect(lvarOn('A32NX_FWC_CCHORD')).toBe(false);
    }

    sounds.handleSoundCondition('continuousRepetitiveChime', false);
    sounds.onUpdate(60);
    sounds.onUpdate(60);
    expect(lvarOn('A32NX_FWC_CRC')).toBe(false);
    expect(lvarOn('A32NX_FWC_CCHORD')).toBe(true);
  });

  it('does not cut the cavalry charge, which is not continuous: the chime starts when its 1 s ends', () => {
    const sounds = new FwsSoundManager(new EventBus(), Subject.create(true));
    sounds.enqueueSound('cavalryCharge');
    sounds.onUpdate(60);
    expect(lvarOn('A32NX_FWC_CAVALRY_CHARGE')).toBe(true);

    sounds.handleSoundCondition('continuousRepetitiveChime', true);
    sounds.onUpdate(300);
    expect(lvarOn('A32NX_FWC_CAVALRY_CHARGE')).toBe(true);
    expect(lvarOn('A32NX_FWC_CRC')).toBe(false);

    sounds.onUpdate(900);
    sounds.onUpdate(60);
    expect(lvarOn('A32NX_FWC_CAVALRY_CHARGE')).toBe(false);
    expect(lvarOn('A32NX_FWC_CRC')).toBe(true);
  });

  it('does not cut the continuous repetitive chime for the C chord', () => {
    const sounds = new FwsSoundManager(new EventBus(), Subject.create(true));
    startPlaying(sounds, 'continuousRepetitiveChime');

    sounds.handleSoundCondition('cChordCont', true);
    for (let i = 0; i < 5; i++) {
      sounds.onUpdate(600);
      expect(lvarOn('A32NX_FWC_CRC')).toBe(true);
      expect(lvarOn('A32NX_FWC_CCHORD')).toBe(false);
    }
  });

  it('does not cut a continuous sound for a queued sound of the same priority', () => {
    const sounds = new FwsSoundManager(new EventBus(), Subject.create(true));
    startPlaying(sounds, 'cChordCont');

    // The triple click has the same priority as the C chord
    sounds.enqueueSound('tripleClick');
    for (let i = 0; i < 5; i++) {
      sounds.onUpdate(600);
      expect(lvarOn('A32NX_FWC_CCHORD')).toBe(true);
    }
  });

  it('keeps cutting a continuous voice only for a voice of a higher priority number', () => {
    const sounds = new FwsSoundManager(new EventBus(), Subject.create(true));
    sounds.handleSoundCondition('brakeMaxBraking', true);
    sounds.onUpdate(60);
    expect(lvarOn('A32NX_AUDIO_ROP_MAX_BRAKING')).toBe(true);

    sounds.enqueueSound('runwayTooShort');
    for (let i = 0; i < 5; i++) {
      sounds.onUpdate(600);
      expect(lvarOn('A32NX_AUDIO_ROP_MAX_BRAKING')).toBe(true);
    }

    sounds.enqueueSound('pitchPitch');
    sounds.onUpdate(60);
    expect(lvarOn('A32NX_AUDIO_ROP_MAX_BRAKING')).toBe(false);
  });

  it('starts nothing behind the stall hold even with a more important chime queued', () => {
    const sounds = new FwsSoundManager(new EventBus(), Subject.create(true));
    startPlaying(sounds, 'cChordCont');

    sounds.setAuralsInhibited(true);
    sounds.handleSoundCondition('continuousRepetitiveChime', true);
    for (let i = 0; i < 10; i++) {
      sounds.onUpdate(600);
      expect(lvarOn('A32NX_FWC_CCHORD')).toBe(false);
      expect(lvarOn('A32NX_FWC_CRC')).toBe(false);
    }

    sounds.setAuralsInhibited(false);
    sounds.onUpdate(60);
    expect(lvarOn('A32NX_FWC_CRC')).toBe(true);
  });
});
