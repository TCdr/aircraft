// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, Subject } from '@microsoft/msfs-sdk';
import { FwsAuralsList, FwsSoundManager } from './FwsSoundManager';

const SPEED_LOCAL_VAR = 'L:A32NX_FWS_AUDIO_SPEED';
const STEP_MS = 60;

/** Whether the SPEED L:var is set, and how many times it went from false to true */
let speedPlaying: boolean;
let speedStarts: number;

beforeEach(() => {
  speedPlaying = false;
  speedStarts = 0;
  vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: unknown) => {
    if (name === SPEED_LOCAL_VAR) {
      if (value === true && !speedPlaying) {
        speedStarts++;
      }
      speedPlaying = value === true;
    }
    return Promise.resolve();
  });
});

function createSoundManager() {
  return new FwsSoundManager(new EventBus(), Subject.create(true), Subject.create(false));
}

function runFor(sounds: FwsSoundManager, seconds: number) {
  for (let elapsedMs = 0; elapsedMs < seconds * 1_000; elapsedMs += STEP_MS) {
    sounds.onUpdate(STEP_MS);
  }
}

describe('A380 SPEED SPEED SPEED sound', () => {
  it('is said three times', () => {
    const sounds = createSoundManager();
    sounds.enqueueSound('speedSpeedSpeed');
    runFor(sounds, 2.5);
    expect(speedStarts).toBe(3);
    expect(speedPlaying).toBe(false);
  });

  it('EMER CANC stops the series', () => {
    const sounds = createSoundManager();
    sounds.enqueueSound('speedSpeedSpeed');
    sounds.onUpdate(STEP_MS);
    expect(speedStarts).toBe(1);
    sounds.cancelAll();
    runFor(sounds, 2);
    expect(speedStarts).toBe(1);
  });

  it('dequeuing between two words drops the rest of the series', () => {
    const sounds = createSoundManager();
    sounds.enqueueSound('speedSpeedSpeed');
    while (speedStarts === 0 || speedPlaying) {
      sounds.onUpdate(STEP_MS);
    }
    sounds.dequeueSound('speedSpeedSpeed');
    runFor(sounds, 2);
    expect(speedStarts).toBe(1);
  });

  it('dequeuing while a word plays lets the word end and drops the repeats', () => {
    const sounds = createSoundManager();
    sounds.enqueueSound('speedSpeedSpeed');
    sounds.onUpdate(STEP_MS);
    sounds.dequeueSound('speedSpeedSpeed');
    runFor(sounds, 2);
    expect(speedStarts).toBe(1);
    expect(speedPlaying).toBe(false);
  });

  it('dequeuing a sound that is not queued does nothing', () => {
    const sounds = createSoundManager();
    sounds.dequeueSound('speedSpeedSpeed');
    sounds.enqueueSound('speedSpeedSpeed');
    runFor(sounds, 2.5);
    expect(speedStarts).toBe(3);
  });

  it('is played by the aural_speed sound bank event on its L:var', () => {
    const soundXml = readFileSync(
      resolve(
        __dirname,
        '../../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/common/sound/sound.xml',
      ),
      'utf8',
    );
    const entry = /<Sound [^>]*WwiseEvent="aural_speed"[^>]*>/.exec(soundXml);
    expect(entry).not.toBeNull();
    expect(entry![0]).toContain(`LocalVar="${FwsAuralsList.speedSpeedSpeed?.localVarName}"`);
    expect(entry![0]).toContain('Continuous="true"');
  });
});
