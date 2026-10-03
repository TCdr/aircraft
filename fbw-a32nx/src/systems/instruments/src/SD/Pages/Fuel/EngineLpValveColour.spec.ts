// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isEngineLpValveGreen } from './EngineLpValveColour';

describe('SD FUEL engine LP valve colour (FCOM DSC-28-20-F)', () => {
  it('is green when the valve is open with the ENG MASTER ON', () => {
    expect(isEngineLpValveGreen(100, true)).toBe(true);
  });

  it('is amber when the valve is open with the ENG MASTER OFF', () => {
    expect(isEngineLpValveGreen(100, false)).toBe(false);
  });

  it('is amber when the valve is in transit or closed', () => {
    expect(isEngineLpValveGreen(40, true)).toBe(false);
    expect(isEngineLpValveGreen(0, true)).toBe(false);
  });
});
