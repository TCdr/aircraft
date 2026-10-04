// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { jettisonValveIndication } from './JettisonValveIndication';

describe('SD FUEL jettison indication (FCOM DSC-28-20)', () => {
  it('is normal (white, no fault) when the valve is open during a jettison', () => {
    expect(jettisonValveIndication(true, true)).toEqual({ fault: false, textClass: 'White' });
  });

  it('is amber when the valve is open without a jettison (abnormally open)', () => {
    expect(jettisonValveIndication(true, false)).toEqual({ fault: true, textClass: 'Amber' });
  });

  it('is amber when the jettison is active but the valve is closed', () => {
    expect(jettisonValveIndication(false, true).textClass).toBe('Amber');
  });

  it('the FUEL page takes the jettison state from the FQMS', () => {
    const page = readFileSync(resolve(__dirname, 'FuelPage.tsx'), 'utf8');
    expect(page).toMatch(/useSimVar\('L:A380X_FUEL_JETTISON_IN_PROGRESS'/);
    expect(page).not.toMatch(/isJettisonActive = false/);
  });
});
