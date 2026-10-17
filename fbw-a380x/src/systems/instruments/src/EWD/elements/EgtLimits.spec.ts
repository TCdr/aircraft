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
  egtLimit,
  egtLimitMarkVisible,
  EGT_RELIGHT_LIMIT_C,
  EGT_START_LIMIT_C,
  ExceedanceMemory,
  n1Exceeds,
  n3Exceeds,
  ThrustLimitType,
  trimmedEgt,
} from './EgtLimits';

/* No amber EGT indication during takeoff or with the reversers selected. */
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

describe('EWD EGT with the engine failures', () => {
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
    memory.update(890, false, true);
    expect(memory.exceeded).toBe(false);
    memory.update(950, false, true);
    memory.update(920, false, true);
    expect(memory.exceeded).toBe(true);
    expect(memory.highestValue).toBe(950);
    memory.update(400, true, true);
    expect(memory.exceeded).toBe(false);
  });

  // a parameter that is not available shows XX instead of its value
  it('latches no red mark on an EGT the FADEC does not send (XX)', () => {
    const memory = new ExceedanceMemory(900);
    memory.update(1200, false, false);
    expect(memory.exceeded).toBe(false);
    expect(memory.highestValue).toBe(0);
  });

  it('ignores a value that is not a finite number and keeps the highest value through a NaN', () => {
    const memory = new ExceedanceMemory(900);
    memory.update(Infinity, false, true);
    expect(memory.exceeded).toBe(false);
    memory.update(950, false, true);
    memory.update(NaN, false, true);
    expect(memory.exceeded).toBe(true);
    expect(memory.highestValue).toBe(950);
  });

  it('has the N1 and N2 (FBW N3) red limits of 111 % and 118.7 %', () => {
    expect(n1Exceeds(111)).toBe(false);
    expect(n1Exceeds(111.1)).toBe(true);
    expect(n3Exceeds(118.7)).toBe(false);
    expect(n3Exceeds(118.8)).toBe(true);
  });
});

describe('EWD EGT limit during a start sequence', () => {
  it('is 745 °C during a ground start (STARTING or RESTARTING)', () => {
    expect(EGT_START_LIMIT_C).toBe(745);
    expect(egtLimit(2, true)).toBe(745);
    expect(egtLimit(3, true)).toBe(745);
  });

  it('is 865 °C during a relight in flight', () => {
    expect(EGT_RELIGHT_LIMIT_C).toBe(865);
    expect(egtLimit(2, false)).toBe(865);
    expect(egtLimit(3, false)).toBe(865);
  });

  it('is the normal limit with the engine running or off', () => {
    expect(egtLimit(1, true)).toBe(850);
    expect(egtLimit(1, false)).toBe(850);
    expect(egtLimit(0, true)).toBe(850);
  });

  it('turns a hot start amber above 745 °C', () => {
    expect(egtColour(760, ThrustLimitType.None, egtLimit(2, true))).toBe('Amber');
    expect(egtColour(700, ThrustLimitType.None, egtLimit(2, true))).toBe('Green');
    expect(egtColour(760, ThrustLimitType.None)).toBe('Green');
  });

  it('shows the start EGT without the EEC trim, so a relight above 865 °C shows', () => {
    expect(displayedEgt(880, 0, ThrustLimitType.Clb, true)).toBe(880);
    expect(displayedEgt(880, 0, ThrustLimitType.Clb)).toBe(850);
    expect(egtColour(displayedEgt(880, 0, ThrustLimitType.Clb, true), ThrustLimitType.Clb, egtLimit(3, false))).toBe(
      'Amber',
    );
  });
});
