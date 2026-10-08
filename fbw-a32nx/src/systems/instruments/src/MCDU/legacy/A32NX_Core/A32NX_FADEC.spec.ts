// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FadecPowerInputs, isFadecPowered } from './A32NX_FADEC';

describe('FADEC power and engine data', () => {
  const running: FadecPowerInputs = {
    bothChannelsLost: false,
    firePbPushed: false,
    n2Percent: 80,
    engModeSelNorm: true,
    fadecGroundPowerOn: false,
    fadecTimerRunning: false,
  };

  it('is powered while the engine runs', () => {
    expect(isFadecPowered(running)).toBe(true);
  });

  /* A320 FCOM ENG 1(2) FADEC FAULT (a320_fcom.txt l.79652-79653): the engine indications are lost */
  it('sends no engine data with both FADEC channels lost, even with the engine running', () => {
    expect(isFadecPowered({ ...running, bothChannelsLost: true })).toBe(false);
    expect(isFadecPowered({ ...running, bothChannelsLost: true, fadecGroundPowerOn: true })).toBe(false);
  });

  it('is unpowered with the FIRE pb pushed, and on the ground after its timer with the engine off', () => {
    expect(isFadecPowered({ ...running, firePbPushed: true })).toBe(false);
    expect(isFadecPowered({ ...running, n2Percent: 0 })).toBe(false);
    expect(isFadecPowered({ ...running, n2Percent: 0, fadecTimerRunning: true })).toBe(true);
    expect(isFadecPowered({ ...running, n2Percent: 0, engModeSelNorm: false })).toBe(true);
  });
});
