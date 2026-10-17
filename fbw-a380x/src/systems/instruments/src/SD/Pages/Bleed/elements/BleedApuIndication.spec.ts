// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isApuBleedValveAbnormal } from './BleedApuIndication';

describe('SD BLEED APU bleed valve', () => {
  it('green when the valve agrees with its command', () => {
    // APU AVAIL, APU BLEED ON: open
    expect(isApuBleedValveAbnormal(true, true, true)).toBe(false);
    // APU not AVAIL yet: closed
    expect(isApuBleedValveAbnormal(false, true, false)).toBe(false);
  });

  it('amber "abnormally open, and the APU BLEED pb-sw is ON"', () => {
    expect(isApuBleedValveAbnormal(true, true, false)).toBe(true);
  });

  it('amber "abnormally closed, and the APU BLEED pb-sw is ON"', () => {
    expect(isApuBleedValveAbnormal(false, true, true)).toBe(true);
  });

  it('never amber with the APU BLEED pb-sw OFF', () => {
    expect(isApuBleedValveAbnormal(false, false, true)).toBe(false);
    expect(isApuBleedValveAbnormal(true, false, false)).toBe(false);
  });

  it('the APU bleed valve symbol uses the abnormal colour', () => {
    const element = readFileSync(resolve(__dirname, 'BleedApu.tsx'), 'utf-8');
    expect(element).toContain("apuBleedValveAbnormal ? 'Amber SW2 NoFill' : 'Green SW2 NoFill'");
    expect(element).toContain('css={apuBleedValveCss}');
  });
});
