// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  DEACTIVATION_AFTER_LAST_ENGINE_SHUTDOWN_MS,
  DEACTIVATION_AFTER_POWER_UP_MS,
  NonSensedProcAutoDeactivation,
} from './FwsNonSensedAutoDeactivation';

const MINUTE = 60 * 1000;
const STEP = 500;

/**
 * Runs the deactivation for a duration in steps of 0.5 s
 * @returns the number of updates that asked for a deactivation
 */
function run(
  deactivation: NonSensedProcAutoDeactivation,
  durationMs: number,
  anyEngineRunning: boolean,
  onGround = true,
): number {
  let deactivations = 0;
  for (let t = 0; t < durationMs; t += STEP) {
    if (deactivation.update(STEP, anyEngineRunning, onGround)) {
      deactivations++;
    }
  }
  return deactivations;
}

describe('Automatic deactivation of the not-sensed ABN PROCs', () => {
  it('uses the delays: 15 min after the last engine shutdown, 10 min after power-up', () => {
    expect(DEACTIVATION_AFTER_LAST_ENGINE_SHUTDOWN_MS).toBe(15 * MINUTE);
    expect(DEACTIVATION_AFTER_POWER_UP_MS).toBe(10 * MINUTE);
  });

  it('deactivates once, 10 minutes after power-up on ground with the engines off', () => {
    const deactivation = new NonSensedProcAutoDeactivation();
    expect(run(deactivation, 10 * MINUTE - STEP, false)).toBe(0);
    expect(run(deactivation, STEP, false)).toBe(1);
    expect(run(deactivation, 30 * MINUTE, false)).toBe(0);
  });

  it('does not deactivate at the power-up mark with an engine running', () => {
    const deactivation = new NonSensedProcAutoDeactivation();
    expect(run(deactivation, 5 * MINUTE, false)).toBe(0);
    expect(run(deactivation, 10 * MINUTE, true)).toBe(0);
  });

  it('deactivates once, 15 minutes after the last engine shutdown', () => {
    const deactivation = new NonSensedProcAutoDeactivation();
    run(deactivation, 11 * MINUTE, false);
    expect(run(deactivation, 60 * MINUTE, true)).toBe(0);
    expect(run(deactivation, 15 * MINUTE - STEP, false)).toBe(0);
    expect(run(deactivation, 2 * STEP, false)).toBe(1);
    expect(run(deactivation, 30 * MINUTE, false)).toBe(0);
  });

  it('starts the 15 minutes again when an engine is started before they are over', () => {
    const deactivation = new NonSensedProcAutoDeactivation();
    run(deactivation, 11 * MINUTE, true);
    expect(run(deactivation, 10 * MINUTE, false)).toBe(0);
    expect(run(deactivation, MINUTE, true)).toBe(0);
    expect(run(deactivation, 14 * MINUTE, false)).toBe(0);
    expect(run(deactivation, 2 * MINUTE, false)).toBe(1);
  });

  it('does not deactivate in flight (FWS power-up or all engines out in flight)', () => {
    const deactivation = new NonSensedProcAutoDeactivation();
    expect(run(deactivation, 11 * MINUTE, false, false)).toBe(0);
    run(deactivation, MINUTE, true, false);
    expect(run(deactivation, 20 * MINUTE, false, false)).toBe(0);
  });

  it('starts the power-up countdown again on reset (FWS power-up)', () => {
    const deactivation = new NonSensedProcAutoDeactivation();
    expect(run(deactivation, 11 * MINUTE, false)).toBe(1);
    deactivation.reset();
    expect(run(deactivation, 11 * MINUTE, false)).toBe(1);
  });

  it('clears the active not-sensed procedures in FwsCore and resets at the FWS power-up', () => {
    const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
    expect(core).toMatch(
      /this\.nonSensedProcAutoDeactivation\.update\([\s\S]{0,300}\)\s*\)\s*\{\s*this\.activeAbnormalNonSensedKeys\.clear\(\);/,
    );
    expect(core).toContain('this.nonSensedProcAutoDeactivation.reset();');
  });
});
