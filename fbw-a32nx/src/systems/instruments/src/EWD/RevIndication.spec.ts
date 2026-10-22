// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { RevDisplay, RevIndication, RevInputs } from './RevIndication';

const stowed: RevInputs = { inTransit: false, deployed: false, onGround: false };
const unlockedInFlight: RevInputs = { inTransit: true, deployed: false, onGround: false };

/** Runs the indication for a duration in 0.5 s steps and returns the last display */
function run(rev: RevIndication, durationS: number, inputs: RevInputs): RevDisplay {
  let display = rev.update(0.5, inputs);
  for (let t = 0.5; t < durationS; t += 0.5) {
    display = rev.update(0.5, inputs);
  }
  return display;
}

describe('EWD REV indication', () => {
  it('is hidden with the reverser stowed and locked', () => {
    expect(new RevIndication().update(0.5, stowed)).toBe('hidden');
    expect(new RevIndication().update(0.5, { ...stowed, onGround: true })).toBe('hidden');
  });

  it('is green on ground with the reverser fully deployed, amber while it is in transit', () => {
    const rev = new RevIndication();
    expect(rev.update(0.5, { inTransit: true, deployed: false, onGround: true })).toBe('amber');
    expect(rev.update(0.5, { inTransit: false, deployed: true, onGround: true })).toBe('green');
  });

  it('pulses amber for 9 s when the reverser unlocks in flight, then stays steady amber', () => {
    const rev = new RevIndication();
    expect(rev.update(0.5, unlockedInFlight)).toBe('amberPulse');
    expect(run(rev, 8.5, unlockedInFlight)).toBe('amberPulse');
    expect(run(rev, 1, unlockedInFlight)).toBe('amber');
    expect(run(rev, 60, unlockedInFlight)).toBe('amber');
  });

  it('is amber, not green, with the reverser fully deployed in flight', () => {
    const rev = new RevIndication();
    const deployedInFlight = { inTransit: false, deployed: true, onGround: false };
    expect(rev.update(0.5, deployedInFlight)).toBe('amberPulse');
    expect(run(rev, 10, deployedInFlight)).toBe('amber');
  });

  it('pulses again when the reverser unlocks again in flight', () => {
    const rev = new RevIndication();
    run(rev, 12, unlockedInFlight);
    expect(rev.update(0.5, stowed)).toBe('hidden');
    expect(rev.update(0.5, unlockedInFlight)).toBe('amberPulse');
  });

  it('does not pulse on ground', () => {
    const rev = new RevIndication();
    expect(run(rev, 3, { inTransit: true, deployed: false, onGround: true })).toBe('amber');
  });
});
