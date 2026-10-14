// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { ratIndication } from './RatIndication';

/* A320 FCOM DSC-29-10-30 HYD page (6) RAT (a320_fcom.txt l.43983-43988) */
describe('SD HYD RAT', () => {
  it('is white and stowed when the strut is in', () => {
    expect(ratIndication(0, false)).toEqual({ notStowed: false, legendAmber: false });
  });

  it('is green when the RAT is not stowed', () => {
    expect(ratIndication(1, false)).toEqual({ notStowed: true, legendAmber: false });
  });

  it('turns its legend amber while the stowing pressure is applied', () => {
    expect(ratIndication(0.5, true)).toEqual({ notStowed: true, legendAmber: true });
  });

  it('is drawn on the page from the stow position and the stowing signal', () => {
    const page = readFileSync(resolve(__dirname, 'Hyd.tsx'), 'utf-8');
    expect(page).toContain('L:A32NX_RAT_STOWING');
    expect(page).toContain('ratIndication(');
  });
});
