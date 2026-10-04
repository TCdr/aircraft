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

describe('FWS aurals without FWC (A320 FCOM PRO-ABN-FWS FWS FWC 1 + 2 FAULT)', () => {
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
});
