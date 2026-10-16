// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isIdleIndicationShown } from './IdleIndication';

const IDLE_N1 = 20;

/* A380 FCOM DSC-70-90 IDLE INDICATION (a380_fcom.txt l.112973-112974) */
describe('EWD IDLE indication', () => {
  it('shows in flight with at least three engines at idle, also with the A/THR off', () => {
    // the indication has no A/THR input: the A/THR state cannot hide it
    expect(isIdleIndicationShown([IDLE_N1, IDLE_N1, IDLE_N1, 80], IDLE_N1, 8)).toBe(true);
    expect(isIdleIndicationShown([IDLE_N1, IDLE_N1, IDLE_N1, IDLE_N1], IDLE_N1, 9)).toBe(true);
  });

  it('does not show with fewer than three engines at idle', () => {
    expect(isIdleIndicationShown([IDLE_N1, IDLE_N1, 80, 80], IDLE_N1, 8)).toBe(false);
  });

  it('does not show on ground', () => {
    // FWC flight phases 1-5 and 10-12 (FwsFlightPhases FwcFlightPhase): before lift-off and after touchdown
    expect(isIdleIndicationShown([IDLE_N1, IDLE_N1, IDLE_N1, IDLE_N1], IDLE_N1, 2)).toBe(false);
    expect(isIdleIndicationShown([IDLE_N1, IDLE_N1, IDLE_N1, IDLE_N1], IDLE_N1, 10)).toBe(false);
  });
});
