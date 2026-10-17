// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  CrossBleedSelectorPosition,
  isCrossBleedValveAmber,
  isCrossBleedValveCommandedOpen,
} from './CrossBleedValveIndication';

/* Crossbleed valve of the BLEED page */
describe('BLEED page crossbleed valve', () => {
  it('follows the selector in SHUT and OPEN, the APU bleed valve in AUTO', () => {
    expect(isCrossBleedValveCommandedOpen(CrossBleedSelectorPosition.Shut, true)).toBe(false);
    expect(isCrossBleedValveCommandedOpen(CrossBleedSelectorPosition.Open, false)).toBe(true);
    expect(isCrossBleedValveCommandedOpen(CrossBleedSelectorPosition.Auto, true)).toBe(true);
    expect(isCrossBleedValveCommandedOpen(CrossBleedSelectorPosition.Auto, false)).toBe(false);
  });

  it('is green when closed as commanded and open as commanded', () => {
    expect(isCrossBleedValveAmber(false, false, true)).toBe(false);
    expect(isCrossBleedValveAmber(true, true, false)).toBe(false);
  });

  it('is amber in transit', () => {
    expect(isCrossBleedValveAmber(true, false, false)).toBe(true);
    expect(isCrossBleedValveAmber(false, false, false)).toBe(true);
  });

  it('is amber crossline when closed but commanded open', () => {
    expect(isCrossBleedValveAmber(true, false, true)).toBe(true);
  });

  it('is amber in line when open but commanded closed', () => {
    expect(isCrossBleedValveAmber(false, true, false)).toBe(true);
  });
});
