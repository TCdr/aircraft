// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { ptuSymbolColor } from './PtuIndication';

/* A320 FCOM DSC-29-20 HYD page (9) PTU control: "Amber: The PTU pb-sw is OFF". */
describe('SD HYD PTU symbol colour', () => {
  it('is green with the PTU pb-sw at AUTO, also when the PTU is inhibited', () => {
    expect(ptuSymbolColor(true)).toBe('Green');
  });

  it('is amber with the PTU pb-sw OFF', () => {
    expect(ptuSymbolColor(false)).toBe('Amber');
  });

  it('the HYD page colours the PTU from the pb-sw, not from the PTU control valve', () => {
    const page = readFileSync(resolve(__dirname, 'Hyd.tsx'), 'utf-8');
    expect(page).toContain("useSimVar('L:A32NX_OVHD_HYD_PTU_PB_IS_AUTO'");
    expect(page).toContain('ptuSymbolColor(ptuPbIsAuto)');
    expect(page).not.toMatch(/if \(ptuControlValveOff\) \{\s*transferColor = TransferColor\.Amber/);
  });
});
