// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { startIgniters } from './A32NX_FADEC';

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
