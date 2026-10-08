// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FadecPowerInputs, isFadecPowered, startIgniters } from './A32NX_FADEC';

const STARTING = 2;
const RESTARTING = 3;
const ON = 1;
const SHUTTING = 4;

describe('FADEC start igniters', () => {
  /* A320 FCOM DSC-70-80-30 (a320_fcom.txt l.63481-63482): "In case of start attempt in flight, when the ENG MASTER sw is
   * ON, both igniters are supplied"; DSC-70-80-40 (l.63704-63706): "In flight: Immediately". */
  it('supplies both igniters at once during an in-flight relight, at any N2 and selector position', () => {
    expect(startIgniters(true, RESTARTING, 10, false, 0)).toEqual({ a: true, b: true });
    expect(startIgniters(false, RESTARTING, 10, false, 1)).toEqual({ a: true, b: true });
    expect(startIgniters(true, STARTING, 0, false, 0)).toEqual({ a: true, b: true });
  });

  it('supplies no igniter in flight once the engine runs or while it is shutting down', () => {
    expect(startIgniters(true, ON, 80, false, 0)).toEqual({ a: false, b: false });
    expect(startIgniters(true, SHUTTING, 12, false, 0)).toEqual({ a: false, b: false });
  });

  it('on the ground supplies one igniter, alternated, between 25 % and 55 % N2', () => {
    expect(startIgniters(true, STARTING, 30, true, 0)).toEqual({ a: true, b: false });
    expect(startIgniters(true, STARTING, 30, true, 1)).toEqual({ a: false, b: true });
    expect(startIgniters(true, STARTING, 20, true, 0)).toEqual({ a: false, b: false });
    expect(startIgniters(false, STARTING, 30, true, 0)).toEqual({ a: false, b: false });
  });
});

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
