// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { deltaPClass, deltaPPulses } from './DeltaPIndication';

/* A320 FCOM DSC-21-20-40: delta P pulses if > 1.5 PSI (resets at 1 PSI) during flight phase 7. */
describe('CRUISE page delta P', () => {
  it('is steady green in cruise (phase 6) at 7.9 PSI', () => {
    const pulsing = deltaPPulses(7.9, 6, false);
    expect(deltaPClass(7.9, pulsing)).toBe('Green');
  });

  it('pulses green in phase 7 above 1.5 PSI', () => {
    expect(deltaPClass(1.6, deltaPPulses(1.6, 7, false))).toBe('GreenTextPulse');
  });

  it('keeps pulsing down to 1 PSI (hysteresis)', () => {
    expect(deltaPPulses(1.2, 7, true)).toBe(true);
    expect(deltaPPulses(1.2, 7, false)).toBe(false);
    expect(deltaPPulses(0.9, 7, true)).toBe(false);
  });

  it('is amber out of the normal range', () => {
    expect(deltaPClass(8.6, false)).toBe('Amber');
    expect(deltaPClass(-0.5, false)).toBe('Amber');
  });

  it('the CRUISE page uses the phase rule', () => {
    const page = readFileSync(resolve(__dirname, 'Crz.tsx'), 'utf-8');
    expect(page).toContain('deltaPPulses(deltaPsi, fwcFlightPhase, prev)');
    expect(page).not.toContain("deltaPsi > 1.5 ? 'GreenTextPulse'");
  });
});
