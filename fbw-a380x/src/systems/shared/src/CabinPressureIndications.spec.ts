// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  CruiseCabinAltitudePulse,
  CruiseCabinVsPulse,
  cabinAltitudePulses,
  cabinVsArrowShown,
  cabinVsPulses,
  deltaPColour,
  deltaPPulses,
} from './CabinPressureIndications';

/** FWC flight phase 9, at or below 800 ft in approach (FwsFlightPhases FwcFlightPhase.AtOrBelow800Feet) */
const FINAL_APPROACH = 9;
const CRUISE = 8;

/** Runs a pulse for a duration in 0.5 s steps and returns the last result */
function run(pulse: { update(deltaS: number, value: number): boolean }, durationS: number, value: number): boolean {
  let pulsing = false;
  for (let t = 0; t < durationS; t += 0.5) {
    pulsing = pulse.update(0.5, value);
  }
  return pulsing;
}

/* A380 FCOM DSC-21-30-20 CAB PRESS page V/S INDICATIONS (a380_fcom.txt l.7589-7593) */
describe('CAB PRESS cabin vertical speed pulse', () => {
  it('starts above 1 800 ft/min and stops below 1 600 ft/min', () => {
    expect(cabinVsPulses(1750, false)).toBe(false);
    expect(cabinVsPulses(1900, false)).toBe(true);
    expect(cabinVsPulses(1700, true)).toBe(true);
    expect(cabinVsPulses(1550, true)).toBe(false);
    expect(cabinVsPulses(-1900, false)).toBe(true);
  });

  it('does not pulse at or beyond 6 350 ft/min', () => {
    expect(cabinVsPulses(6400, false)).toBe(false);
    expect(cabinVsPulses(6400, true)).toBe(false);
  });
});

/* CAB PRESS page CAB ALT INDICATIONS (l.7542-7546) */
describe('CAB PRESS cabin altitude pulse', () => {
  it('starts above 8 300 ft below 9 550 ft and stops below 8 100 ft', () => {
    expect(cabinAltitudePulses(8250, false)).toBe(false);
    expect(cabinAltitudePulses(8350, false)).toBe(true);
    expect(cabinAltitudePulses(8150, true)).toBe(true);
    expect(cabinAltitudePulses(8050, true)).toBe(false);
  });

  it('does not pulse green in the red range', () => {
    expect(cabinAltitudePulses(9600, true)).toBe(false);
  });
});

/* CAB PRESS DELTA P INDICATIONS (l.7514-7516) and CRUISE page DIFFERENTIAL PRESSURE (l.7684-7692) */
describe('delta P pulse in final approach', () => {
  it('starts from 1.5 PSI in final approach and stops below 1 PSI', () => {
    expect(deltaPPulses(1.4, FINAL_APPROACH, false)).toBe(false);
    expect(deltaPPulses(1.5, FINAL_APPROACH, false)).toBe(true);
    expect(deltaPPulses(1.1, FINAL_APPROACH, true)).toBe(true);
    expect(deltaPPulses(0.9, FINAL_APPROACH, true)).toBe(false);
  });

  it('does not pulse out of final approach or above the normal range', () => {
    expect(deltaPPulses(5, CRUISE, false)).toBe(false);
    expect(deltaPPulses(5, CRUISE, true)).toBe(false);
    expect(deltaPPulses(9, FINAL_APPROACH, false)).toBe(false);
  });
});

/* CRUISE page DIFFERENTIAL PRESSURE colours (l.7684, l.7707-7717) */
describe('delta P colour', () => {
  it('is green in the normal range, amber then red outside', () => {
    expect(deltaPColour(5)).toBe('Green');
    expect(deltaPColour(-0.1)).toBe('Green');
    expect(deltaPColour(-0.5)).toBe('Amber');
    expect(deltaPColour(9)).toBe('Amber');
    expect(deltaPColour(-0.8)).toBe('Red');
    expect(deltaPColour(9.3)).toBe('Red');
  });
});

/* CRUISE page cabin vertical speed (l.7731-7748) */
describe('CRUISE cabin vertical speed', () => {
  it('shows the arrow above 25 ft/min only', () => {
    expect(cabinVsArrowShown(20)).toBe(false);
    expect(cabinVsArrowShown(-20)).toBe(false);
    expect(cabinVsArrowShown(30)).toBe(true);
    expect(cabinVsArrowShown(-30)).toBe(true);
  });

  it('pulses after more than 5 s above 1 600 ft/min, from 1 800 ft/min, and stops below 1 650 ft/min', () => {
    const pulse = new CruiseCabinVsPulse();
    expect(run(pulse, 5, 1900)).toBe(false);
    expect(run(pulse, 1, 1900)).toBe(true);
    expect(run(pulse, 1, 1700)).toBe(true);
    expect(run(pulse, 1, 1600)).toBe(false);
    expect(run(pulse, 10, 1700)).toBe(false);
  });

  it('pulses in descent too', () => {
    expect(run(new CruiseCabinVsPulse(), 6, -2000)).toBe(true);
  });
});

/* CRUISE page CAB ALT (l.7801-7802) */
describe('CRUISE cabin altitude', () => {
  it('pulses after more than 5 s from 8 300 ft to 9 550 ft and stops below 8 100 ft', () => {
    const pulse = new CruiseCabinAltitudePulse();
    expect(run(pulse, 5, 8400)).toBe(false);
    expect(run(pulse, 1, 8400)).toBe(true);
    expect(run(pulse, 1, 8200)).toBe(true);
    expect(run(pulse, 1, 8050)).toBe(false);
  });
});
