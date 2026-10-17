// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { AvailIndication, AvailInputs, FadecEngineState } from './AvailIndication';

const IDLE_N1 = 20.5;

function inputs(engineState: FadecEngineState, onGround: boolean, n1 = IDLE_N1 + 0.5, tlaDegrees = 0): AvailInputs {
  return { engineState, n1, idleN1: IDLE_N1, onGround, tlaDegrees };
}

/** Runs the indication for a duration in 0.5 s steps and returns the last display */
function run(avail: AvailIndication, durationS: number, i: AvailInputs): string {
  let display = avail.update(0.5, i);
  for (let t = 0.5; t < durationS; t += 0.5) {
    display = avail.update(0.5, i);
  }
  return display;
}

describe('EWD AVAIL indication', () => {
  it('stays steady 10 s after a successful start on ground, then goes', () => {
    const avail = new AvailIndication();
    expect(avail.update(0.5, inputs(FadecEngineState.Starting, true, 10))).toBe('hidden');
    expect(avail.update(0.5, inputs(FadecEngineState.Starting, true))).toBe('steady');
    expect(run(avail, 9.5, inputs(FadecEngineState.On, true))).toBe('steady');
    expect(run(avail, 1, inputs(FadecEngineState.On, true))).toBe('hidden');
  });

  it('pulses 1 min after a successful relight in flight', () => {
    const avail = new AvailIndication();
    avail.update(0.5, inputs(FadecEngineState.Restarting, false, 10));
    expect(run(avail, 59.5, inputs(FadecEngineState.On, false))).toBe('pulse');
    expect(run(avail, 1, inputs(FadecEngineState.On, false))).toBe('hidden');
  });

  it('goes when the thrust lever is set above idle', () => {
    const avail = new AvailIndication();
    avail.update(0.5, inputs(FadecEngineState.Starting, true));
    expect(avail.update(0.5, inputs(FadecEngineState.On, true))).toBe('steady');
    expect(avail.update(0.5, inputs(FadecEngineState.On, true, 30, 10))).toBe('hidden');
    expect(avail.update(0.5, inputs(FadecEngineState.On, true, 30, 0))).toBe('hidden');
  });

  it('does not show for a running engine that was not just started', () => {
    const avail = new AvailIndication();
    expect(run(avail, 5, inputs(FadecEngineState.On, true))).toBe('hidden');
  });
});
