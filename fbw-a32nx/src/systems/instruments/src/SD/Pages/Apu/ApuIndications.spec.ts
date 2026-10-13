// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { apuBleedValveDisplay, isApuPageAvailVisible } from './ApuIndications';

/* A320 FCOM DSC-49-20-B ECAM APU PAGE (a320_fcom.txt l.60758-60770) */
describe('SD APU page', () => {
  it('shows AVAIL from APU N above 95 %, before the 99.5 % of the AVAIL light, l.60759', () => {
    expect(isApuPageAvailVisible(true, 96)).toBe(true);
    expect(isApuPageAvailVisible(true, 100)).toBe(true);
  });

  it('shows no AVAIL at or below 95 % or without a valid APU N', () => {
    expect(isApuPageAvailVisible(true, 95)).toBe(false);
    expect(isApuPageAvailVisible(true, 60)).toBe(false);
    expect(isApuPageAvailVisible(false, 100)).toBe(false);
  });

  it('shows an amber XX valve when the ECB sends no valve status, l.60769-60770', () => {
    expect(apuBleedValveDisplay(false, false, false)).toBe('xx-amber');
    expect(apuBleedValveDisplay(false, false, true)).toBe('xx-amber');
    expect(apuBleedValveDisplay(false, true, true)).toBe('xx-amber');
  });

  it('shows the valve in line green when open, crossline green when closed, l.60765-60766', () => {
    expect(apuBleedValveDisplay(true, true, true)).toBe('inline-green');
    expect(apuBleedValveDisplay(true, false, false)).toBe('crossline-green');
  });

  it('shows the valve crossline amber when closed with the APU BLEED pb ON, l.60767', () => {
    expect(apuBleedValveDisplay(true, false, true)).toBe('crossline-amber');
  });
});
