// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FwsPitchAural, isPitchAttitudeExcessive, PitchAuralInputs } from './FwsPitchAural';
import { FwcFlightPhase } from './FwsFlightPhases';

/** A manual landing flare below 400 ft RA, pitch 13 deg */
const flare: PitchAuralInputs = {
  pitchDeg: 13,
  radioHeightFt: 30,
  autopilotEngaged: false,
  flightPhase: FwcFlightPhase.AtOrBelow800Feet,
};

describe('A380 PITCH PITCH alert condition', () => {
  it('manual landing below 400 ft RA with the pitch above 12 deg', () => {
    expect(isPitchAttitudeExcessive(flare)).toBe(true);
    expect(isPitchAttitudeExcessive({ ...flare, flightPhase: FwcFlightPhase.TouchDown, radioHeightFt: 0 })).toBe(true);
  });

  it('not at or below 12 deg', () => {
    expect(isPitchAttitudeExcessive({ ...flare, pitchDeg: 12 })).toBe(false);
  });

  it('not at or above 400 ft RA', () => {
    expect(isPitchAttitudeExcessive({ ...flare, radioHeightFt: 400 })).toBe(false);
    expect(isPitchAttitudeExcessive({ ...flare, radioHeightFt: 399 })).toBe(true);
  });

  it('not with the autopilot engaged (manual landings only)', () => {
    expect(isPitchAttitudeExcessive({ ...flare, autopilotEngaged: true })).toBe(false);
  });

  it('not at takeoff (rotation, initial climb)', () => {
    for (const flightPhase of [
      FwcFlightPhase.AtOrAboveV1,
      FwcFlightPhase.LiftOff,
      FwcFlightPhase.AtOrAbove400Feet,
      FwcFlightPhase.AtOrBelowEightyKnots,
    ]) {
      expect(isPitchAttitudeExcessive({ ...flare, flightPhase })).toBe(false);
    }
  });

  it('not without a valid pitch or radio height', () => {
    expect(isPitchAttitudeExcessive({ ...flare, pitchDeg: null })).toBe(false);
    expect(isPitchAttitudeExcessive({ ...flare, radioHeightFt: null })).toBe(false);
  });
});

describe('A380 PITCH PITCH voice ("Sounds 2 times")', () => {
  it('is said once when the pitch becomes excessive, again at the next occurrence', () => {
    const aural = new FwsPitchAural();
    const pitches = [10, 12.5, 13, 14, 11, 12.1];
    expect(pitches.map((pitchDeg) => aural.update({ ...flare, pitchDeg }))).toEqual([
      false,
      true,
      false,
      false,
      false,
      true,
    ]);
  });
});
