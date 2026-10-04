// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { egtColour, egtLimitMarkVisible, ThrustLimitType, trimmedEgt } from './EgtLimits';

/* A380 FCOM DSC-70-90 EGT INDICATIONS / EGT LIMIT: no amber indication during takeoff or with the reversers selected. */
describe('EWD EGT limits from the thrust limit type', () => {
  it('is amber above the limit at MCT (the TLA of about 25 degrees made it green)', () => {
    expect(egtColour(860, ThrustLimitType.Mct)).toBe('Amber');
  });

  it('is green above the limit at TOGA', () => {
    expect(egtColour(880, ThrustLimitType.Toga)).toBe('Green');
  });

  it('is red from the red line', () => {
    expect(egtColour(905, ThrustLimitType.Clb)).toBe('Red');
    expect(egtColour(905, ThrustLimitType.Toga)).toBe('Red');
  });

  it('shows the amber limit mark at MCT and CLB, not at FLEX, TOGA or reverse', () => {
    expect(egtLimitMarkVisible(ThrustLimitType.Mct)).toBe(true);
    expect(egtLimitMarkVisible(ThrustLimitType.Clb)).toBe(true);
    expect(egtLimitMarkVisible(ThrustLimitType.Flex)).toBe(false);
    expect(egtLimitMarkVisible(ThrustLimitType.Toga)).toBe(false);
    expect(egtLimitMarkVisible(ThrustLimitType.Reverse)).toBe(false);
  });

  it('trims the EGT at the red line at FLEX/TOGA, at the limit otherwise', () => {
    expect(trimmedEgt(880, ThrustLimitType.Toga)).toBe(880);
    expect(trimmedEgt(880, ThrustLimitType.Mct)).toBe(850);
  });

  it('the gauge reads the thrust limit type, not the thrust lever angle', () => {
    const gauge = readFileSync(resolve(__dirname, 'EGT.tsx'), 'utf-8');
    expect(gauge).toContain("this.sub.on('thrust_limit_type')");
    expect(gauge).not.toContain('throttle_position_');
  });
});
