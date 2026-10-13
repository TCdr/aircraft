// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { apuBleedValveCss } from './ApuBleedValveIndication';

/* A320 FCOM DSC-36-20 ECAM BLEED PAGE (4) APU BLEED VALVE (a320_fcom.txt l.57801-57808) */
describe('BLEED page APU bleed valve', () => {
  it('is amber crossline when closed with the APU master switch ON and the APU BLEED pb ON for 10 s', () => {
    expect(apuBleedValveCss(false, true, true)).toBe('AmberLine');
  });

  it('stays green while the APU BLEED pb is ON for less than 10 s', () => {
    expect(apuBleedValveCss(false, true, false)).toBe('GreenLine');
  });

  it('stays green with the APU master switch OFF (the page shows the valve while AVAIL is on)', () => {
    expect(apuBleedValveCss(false, false, true)).toBe('GreenLine');
  });

  it('is green when open', () => {
    expect(apuBleedValveCss(true, true, true)).toBe('GreenLine');
  });
});
