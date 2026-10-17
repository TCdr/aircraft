// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { apuBleedValveDisplay, isApuLowOilLevelShown, isApuPageAvailVisible } from './ApuIndications';

/* SD APU page: AVAIL, APU bleed valve and LOW OIL LEVEL */
describe('SD APU page', () => {
  it('shows AVAIL from APU N above 95 %, before the 99.5 % of the AVAIL light', () => {
    expect(isApuPageAvailVisible(true, 96)).toBe(true);
    expect(isApuPageAvailVisible(true, 100)).toBe(true);
  });

  it('shows no AVAIL at or below 95 % or without a valid APU N', () => {
    expect(isApuPageAvailVisible(true, 95)).toBe(false);
    expect(isApuPageAvailVisible(true, 60)).toBe(false);
    expect(isApuPageAvailVisible(false, 100)).toBe(false);
  });

  it('shows an amber XX valve when the ECB sends no valve status', () => {
    expect(apuBleedValveDisplay(false, false, false)).toBe('xx-amber');
    expect(apuBleedValveDisplay(false, false, true)).toBe('xx-amber');
    expect(apuBleedValveDisplay(false, true, true)).toBe('xx-amber');
  });

  it('shows the valve in line green when open, crossline green when closed', () => {
    expect(apuBleedValveDisplay(true, true, true)).toBe('inline-green');
    expect(apuBleedValveDisplay(true, false, false)).toBe('crossline-green');
  });

  it('shows the valve crossline amber when closed with the APU BLEED pb ON', () => {
    expect(apuBleedValveDisplay(true, false, true)).toBe('crossline-amber');
  });

  it('shows LOW OIL LEVEL when the ECB detects a low oil level', () => {
    expect(isApuLowOilLevelShown(true, true)).toBe(true);
    expect(isApuLowOilLevelShown(true, false)).toBe(false);
    // ECB off: no data, no advisory
    expect(isApuLowOilLevelShown(false, true)).toBe(false);
  });

  it('draws LOW OIL LEVEL pulsing from the ECB word', () => {
    const page = readFileSync(resolve(__dirname, 'Apu.tsx'), 'utf-8');
    expect(page).toContain("useArinc429Var('L:A32NX_APU_LOW_OIL_LEVEL'");
    expect(page).toContain('LOW OIL LEVEL');
    expect(page).toContain('isApuLowOilLevelShown(');
  });
});
