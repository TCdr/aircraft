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

const altitudeAlertPlaying = () => lvars.get('L:A32NX_ALT_DEVIATION') === true;

describe('Altitude alert C chord', () => {
  it('the C chord on approach to the selected altitude sounds for 1.5 s', () => {
    const sounds = new FwsSoundManager(new EventBus(), Subject.create(true), Subject.create(false));
    sounds.enqueueSound('cChordOnce');
    sounds.onUpdate(60);
    expect(altitudeAlertPlaying()).toBe(true);

    for (let elapsed = 0.06; elapsed < 1.3; elapsed += 0.06) {
      sounds.onUpdate(60);
    }
    expect(altitudeAlertPlaying()).toBe(true);

    for (let elapsed = 1.3; elapsed < 1.62; elapsed += 0.06) {
      sounds.onUpdate(60);
    }
    expect(altitudeAlertPlaying()).toBe(false);
  });
});
