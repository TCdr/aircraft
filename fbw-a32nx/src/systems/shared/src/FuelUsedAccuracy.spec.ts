// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FuelUsedAccuracy } from './FuelUsedAccuracy';

const ON = 1;
const STARTING = 2;
const RESTARTING = 3;
const OFF = 0;

/** Runs `seconds` of 1 s updates and returns the last result */
function run(accuracy: FuelUsedAccuracy, seconds: number, ffValid: boolean, onGround: boolean, state: number): boolean {
  let degraded = false;
  for (let t = 0; t < seconds; t++) {
    degraded = accuracy.update(1, ffValid, onGround, state);
  }
  return degraded;
}

describe('fuel used accuracy', () => {
  it('is normal with a valid fuel flow', () => {
    expect(run(new FuelUsedAccuracy(), 600, true, false, ON)).toBe(false);
  });

  it('is degraded once the fuel flow is invalid in flight for more than 1 min', () => {
    const accuracy = new FuelUsedAccuracy();
    expect(run(accuracy, 60, false, false, OFF)).toBe(false);
    expect(run(accuracy, 1, false, false, OFF)).toBe(true);
  });

  it('is not degraded by a short loss of the fuel flow', () => {
    const accuracy = new FuelUsedAccuracy();
    run(accuracy, 50, false, false, OFF);
    run(accuracy, 1, true, false, ON);
    expect(run(accuracy, 50, false, false, OFF)).toBe(false);
  });

  it('is not degraded by an invalid fuel flow on ground (FADEC off after the flight)', () => {
    expect(run(new FuelUsedAccuracy(), 600, false, true, OFF)).toBe(false);
  });

  it('stays degraded until the fuel used is reset at the next engine start on ground', () => {
    const accuracy = new FuelUsedAccuracy();
    run(accuracy, 61, false, false, OFF);
    expect(run(accuracy, 10, true, false, ON)).toBe(true);
    expect(run(accuracy, 10, false, true, OFF)).toBe(true);
    expect(run(accuracy, 1, true, true, STARTING)).toBe(false);
  });

  it('is reset by a restart on ground after a shutdown (RESTARTING)', () => {
    const accuracy = new FuelUsedAccuracy();
    run(accuracy, 61, false, false, OFF);
    expect(run(accuracy, 1, true, true, RESTARTING)).toBe(false);
  });

  it('is not reset by an in-flight relight', () => {
    const accuracy = new FuelUsedAccuracy();
    run(accuracy, 61, false, false, OFF);
    expect(run(accuracy, 30, true, false, STARTING)).toBe(true);
  });
});
