// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { RevDisplay, RevIndication, RevInputs } from './RevIndication';

const stowed: RevInputs = { inTransit: false, deployed: false, reverseSelected: false, onGround: false };
const unlockedInFlight: RevInputs = { ...stowed, inTransit: true };
const onGround: RevInputs = { ...stowed, onGround: true };

/** Runs the indication for a duration in 0.5 s steps and returns the last display */
function run(rev: RevIndication, durationS: number, inputs: RevInputs): RevDisplay {
  let display = rev.update(0.5, inputs);
  for (let t = 0.5; t < durationS; t += 0.5) {
    display = rev.update(0.5, inputs);
  }
  return display;
}

describe('EWD REV 2(3) indication', () => {
  it('is hidden with the reverser stowed and the lever out of the REV detent', () => {
    expect(new RevIndication().update(0.5, stowed)).toBe('hidden');
    expect(new RevIndication().update(0.5, onGround)).toBe('hidden');
  });

  it('is green on ground with the reverse mode selected', () => {
    expect(new RevIndication().update(0.5, { ...onGround, reverseSelected: true, deployed: true })).toBe('green');
  });

  it('is amber on ground with the lever in the REV detent and the reverse mode not available', () => {
    expect(new RevIndication().update(0.5, { ...onGround, reverseSelected: true })).toBe('amber');
    expect(new RevIndication().update(0.5, { ...onGround, reverseSelected: true, inTransit: true })).toBe('amber');
  });

  it('pulses amber for 9 s when the reverser unlocks in flight, then stays steady amber', () => {
    const rev = new RevIndication();
    expect(rev.update(0.5, unlockedInFlight)).toBe('amberPulse');
    expect(run(rev, 8.5, unlockedInFlight)).toBe('amberPulse');
    expect(run(rev, 1, unlockedInFlight)).toBe('amber');
    expect(run(rev, 60, unlockedInFlight)).toBe('amber');
  });

  it('is amber, not green, with the reverser deployed in flight', () => {
    const rev = new RevIndication();
    const deployedInFlight = { ...stowed, deployed: true };
    expect(rev.update(0.5, deployedInFlight)).toBe('amberPulse');
    expect(run(rev, 10, deployedInFlight)).toBe('amber');
  });

  it('pulses again when the reverser unlocks again in flight', () => {
    const rev = new RevIndication();
    run(rev, 12, unlockedInFlight);
    expect(rev.update(0.5, stowed)).toBe('hidden');
    expect(rev.update(0.5, unlockedInFlight)).toBe('amberPulse');
  });
});
