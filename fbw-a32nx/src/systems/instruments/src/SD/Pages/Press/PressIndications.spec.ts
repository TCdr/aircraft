// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  cabinAltitudeNeedleClass,
  cabinAltitudePulses,
  cabinAltitudeTextClass,
  cabinVsPulses,
  ventilationIndication,
} from './PressIndications';

/* CAB ALT digital value pulses at or above 8800 ft (resets at 8600 ft), red above
   9550 ft. */
describe('CAB PRESS page CAB ALT', () => {
  it('starts pulsing at 8800 ft', () => {
    expect(cabinAltitudePulses(8750, false)).toBe(false);
    expect(cabinAltitudePulses(8800, false)).toBe(true);
  });

  it('keeps pulsing down to 8600 ft (hysteresis)', () => {
    expect(cabinAltitudePulses(8700, true)).toBe(true);
    expect(cabinAltitudePulses(8650, true)).toBe(true);
    expect(cabinAltitudePulses(8600, true)).toBe(false);
  });

  it('digits: pulsing green, red from 9550 ft', () => {
    expect(cabinAltitudeTextClass(8700, true)).toBe('GreenTextPulse');
    expect(cabinAltitudeTextClass(8700, false)).toBe('Green');
    expect(cabinAltitudeTextClass(9550, true)).toBe('Red');
  });

  it('the needle never pulses', () => {
    expect(cabinAltitudeNeedleClass(9000)).toBe('Green');
    expect(cabinAltitudeNeedleClass(9550)).toBe('Red');
  });
});

/* V/S digital value pulses when V/S > 1750 ft/min (resets at 1650 ft/min). */
describe('CAB PRESS page V/S', () => {
  it('starts pulsing above 1750 ft/min', () => {
    expect(cabinVsPulses(1750, false)).toBe(false);
    expect(cabinVsPulses(1800, false)).toBe(true);
    expect(cabinVsPulses(-1800, false)).toBe(true);
  });

  it('keeps pulsing down to 1650 ft/min (hysteresis)', () => {
    expect(cabinVsPulses(1700, true)).toBe(true);
    expect(cabinVsPulses(1700, false)).toBe(false);
    expect(cabinVsPulses(1650, true)).toBe(false);
  });
});

describe('CAB PRESS page wiring', () => {
  const page = readFileSync(resolve(__dirname, 'Press.tsx'), 'utf-8');

  it('uses the hysteresis rules for CAB ALT, V/S and delta P', () => {
    expect(page).toContain('cabinAltitudePulses(');
    expect(page).toContain('cabinVsPulses(');
    expect(page).toContain('deltaPPulses(');
  });

  it('pulses no needle: only the digital presentations pulse', () => {
    expect(page).not.toContain('GreenIndicatorPulse');
  });

  it('colours VENT and shows BLOWER and EXTRACT from the fault lights signals and the avionics smoke', () => {
    expect(page).toContain('ventilationIndication(');
    expect(page).toContain('L:A32NX_VENTILATION_BLOWER_FAULT');
    expect(page).toContain('L:A32NX_VENTILATION_EXTRACT_FAULT');
    expect(page).toContain('L:A32NX_SMOKE_AVIONICS_DETECTED');
    expect(page).toContain('BLOWER');
    expect(page).toContain('EXTRACT');
  });
});

/* CAB PRESS page BLOWER, VENT and EXTRACT */
describe('CAB PRESS page avionics ventilation', () => {
  it('shows a white VENT alone without fault', () => {
    expect(ventilationIndication(false, false)).toEqual({ ventAmber: false, blowerShown: false, extractShown: false });
  });

  it('shows an amber BLOWER and turns VENT amber on a BLOWER FAULT', () => {
    expect(ventilationIndication(true, false)).toEqual({ ventAmber: true, blowerShown: true, extractShown: false });
  });

  it('shows an amber EXTRACT and turns VENT amber on an EXTRACT FAULT', () => {
    expect(ventilationIndication(false, true)).toEqual({ ventAmber: true, blowerShown: false, extractShown: true });
  });
});
