// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { cabinAltitudeNeedleClass } from './CabinAltitudeIndication';

/* A380 FCOM DSC-21-30-20 CABIN ALTITUDE: abnormal (red) above 9 550 ft. */
describe('SD PRESS CAB ALT needle', () => {
  it('is normal at 50 ft and at 8 000 ft', () => {
    expect(cabinAltitudeNeedleClass(50)).toBe('GaugeIndicator');
    expect(cabinAltitudeNeedleClass(8000)).toBe('GaugeIndicator');
  });

  it('is red at 9 600 ft, as the digital value', () => {
    expect(cabinAltitudeNeedleClass(9600)).toBe('RedGaugeIndicator');
  });

  it('the needle uses the rule, not the A320 delta P limits', () => {
    const element = readFileSync(resolve(__dirname, 'CabAlt.tsx'), 'utf-8');
    expect(element).toContain('cabinAltitudeNeedleClass(cabAlt50)');
    expect(element).not.toContain('cabAlt50 >= 8.5');
  });
});
