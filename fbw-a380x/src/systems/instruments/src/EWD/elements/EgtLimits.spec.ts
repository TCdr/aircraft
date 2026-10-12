// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  displayedEgt,
  egtAlertLimit,
  egtColour,
  egtExceedanceShown,
  egtLimitMarkVisible,
  ExceedanceMemory,
  n1Exceeds,
  n3Exceeds,
  ThrustLimitType,
  trimmedEgt,
} from './EgtLimits';

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

describe('EWD EGT with the engine failures (stage B4)', () => {
  it('shows the trimmed EGT of a healthy engine', () => {
    expect(displayedEgt(880, 0, ThrustLimitType.Mct)).toBe(850);
    expect(displayedEgt(800, 0, ThrustLimitType.Mct)).toBe(800);
  });

  it('adds the failure EGT offset on top of the EEC trim', () => {
    // the FADEC EGT includes the offset: 880 = 780 healthy + 100
    expect(displayedEgt(880, 100, ThrustLimitType.Mct)).toBe(880);
    // healthy 870 is trimmed to 850, plus 100
    expect(displayedEgt(970, 100, ThrustLimitType.Clb)).toBe(950);
  });

  it('uses the EGT limit at or below MCT and the red line at TOGA, FLEX, reverse and alpha floor', () => {
    expect(egtAlertLimit(ThrustLimitType.Clb, false)).toBe(850);
    expect(egtAlertLimit(ThrustLimitType.Mct, false)).toBe(850);
    expect(egtAlertLimit(ThrustLimitType.Toga, false)).toBe(900);
    expect(egtAlertLimit(ThrustLimitType.Flex, false)).toBe(900);
    expect(egtAlertLimit(ThrustLimitType.Reverse, false)).toBe(900);
    expect(egtAlertLimit(ThrustLimitType.Clb, true)).toBe(900);
  });

  it('a healthy engine never shows an EGT above the limits', () => {
    expect(egtExceedanceShown(displayedEgt(1000, 0, ThrustLimitType.Clb), 850)).toBe(false);
    expect(egtExceedanceShown(displayedEgt(1000, 0, ThrustLimitType.Toga), 900)).toBe(false);
  });

  it('keeps the red mark at the highest EGT until the next engine start on ground', () => {
    const memory = new ExceedanceMemory(900);
    memory.update(890, false);
    expect(memory.exceeded).toBe(false);
    memory.update(950, false);
    memory.update(920, false);
    expect(memory.exceeded).toBe(true);
    expect(memory.highestValue).toBe(950);
    memory.update(400, true);
    expect(memory.exceeded).toBe(false);
  });

  it('has the FCOM N1 and N2 (FBW N3) red limits of 111 % and 118.7 %', () => {
    expect(n1Exceeds(111)).toBe(false);
    expect(n1Exceeds(111.1)).toBe(true);
    expect(n3Exceeds(118.7)).toBe(false);
    expect(n3Exceeds(118.8)).toBe(true);
  });
});
