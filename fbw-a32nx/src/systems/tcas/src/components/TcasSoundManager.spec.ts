// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RaSound, RaSoundPriority } from '../lib/TcasConstants';
import { TcasSoundManager } from './TcasSoundManager';

const TCAS_AURAL_ACTIVE_VAR = 'L:A32NX_TCAS_AURAL_ACTIVE';

const shortSound = (name: string): RaSound => ({ name, length: 0.5, priority: RaSoundPriority.TA });

describe('the TCAS aural state read by the FWC', () => {
  let auralActiveWrites: unknown[];
  let soundManager: TcasSoundManager;

  beforeEach(() => {
    auralActiveWrites = [];
    vi.stubGlobal('Coherent', { call: vi.fn(() => Promise.resolve()) });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: unknown) => {
      if (name === TCAS_AURAL_ACTIVE_VAR) {
        auralActiveWrites.push(value);
      }
      return Promise.resolve();
    });
    soundManager = new TcasSoundManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('says the TCAS aural is active while a voice plays', () => {
    soundManager.tryPlaySound(shortSound('traffic_traffic'));
    soundManager.update(60);
    expect(auralActiveWrites).toEqual([true]);

    soundManager.update(600);
    soundManager.update(600);
    expect(auralActiveWrites).toEqual([true, false]);
  });

  it('keeps it active between two queued voices', () => {
    soundManager.tryPlaySound(shortSound('first'));
    soundManager.tryPlaySound(shortSound('second'), true);
    for (let i = 0; i < 3; i++) {
      soundManager.update(600);
    }
    // the second voice starts in the update that ends the first one
    expect(auralActiveWrites).toEqual([true]);

    soundManager.update(600);
    soundManager.update(600);
    expect(auralActiveWrites).toEqual([true, false]);
  });

  it('writes the idle state once while no voice plays', () => {
    soundManager.update(60);
    soundManager.update(60);
    expect(auralActiveWrites).toEqual([false]);
  });
});
