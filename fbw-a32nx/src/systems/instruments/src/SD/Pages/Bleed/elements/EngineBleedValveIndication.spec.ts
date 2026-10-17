// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { engineBleedValveCss, hpValveCss } from './EngineBleedValveIndication';

/* HP and engine bleed valves of the BLEED page */
describe('BLEED page HP valve', () => {
  it('is green open or closed without a fault', () => {
    expect(hpValveCss(true, false)).toBe('GreenLine');
    expect(hpValveCss(false, false)).toBe('GreenLine');
  });

  it('is amber crossline when closed while the BMC expects it open', () => {
    expect(hpValveCss(false, true)).toBe('AmberLine');
  });

  it('has no amber in line state', () => {
    expect(hpValveCss(true, true)).toBe('GreenLine');
  });
});

describe('BLEED page engine bleed valve', () => {
  it('is green in its commanded position', () => {
    expect(engineBleedValveCss(false)).toBe('GreenLine');
  });

  it('is amber when not in its commanded position', () => {
    expect(engineBleedValveCss(true)).toBe('AmberLine');
  });
});
