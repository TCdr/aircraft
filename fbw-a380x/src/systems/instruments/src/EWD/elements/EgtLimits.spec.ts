// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  egtColour,
  egtExceedanceShown,
  egtLimit,
  egtLimitMarkVisible,
  EGT_LIMIT_C,
  EGT_RED_LINE_C,
  EGT_RELIGHT_LIMIT_C,
  EGT_START_LIMIT_C,
  EGT_TAKEOFF_RED_C,
  EGT_TAKEOFF_RED_LINE_SECONDS,
  EgtRedLineTimer,
  ExceedanceMemory,
  isEgtRed,
  n1Exceeds,
  n3Exceeds,
  ThrustLimitType,
} from './EgtLimits';

describe('EWD EGT limits', () => {
  it('has the 970 °C EGT limit, the 1 002 °C red line and the takeoff values 1 022 °C / 20 s', () => {
    expect(EGT_LIMIT_C).toBe(970);
    expect(EGT_RED_LINE_C).toBe(1002);
    expect(EGT_TAKEOFF_RED_C).toBe(1022);
    expect(EGT_TAKEOFF_RED_LINE_SECONDS).toBe(20);
  });
});

/* No amber EGT indication during takeoff, with the reversers selected or with the alpha floor protection active. */
describe('EWD EGT limits from the thrust limit type', () => {
  it('is amber above the limit at MCT (the TLA of about 25 degrees made it green)', () => {
    expect(egtColour(970, ThrustLimitType.Mct)).toBe('Green');
    expect(egtColour(980, ThrustLimitType.Mct)).toBe('Amber');
    expect(egtColour(1001, ThrustLimitType.Clb)).toBe('Amber');
  });

  it('is green above the limit at TOGA', () => {
    expect(egtColour(990, ThrustLimitType.Toga)).toBe('Green');
  });

  it('is red from the red line outside the takeoff', () => {
    expect(egtColour(1002, ThrustLimitType.Clb)).toBe('Red');
    expect(egtColour(1002, ThrustLimitType.Mct)).toBe('Red');
    expect(egtColour(1002, ThrustLimitType.Reverse)).toBe('Red');
    expect(egtColour(1002, ThrustLimitType.None)).toBe('Red');
  });

  it('shows the amber limit mark at MCT and CLB, not at FLEX, TOGA or reverse', () => {
    expect(egtLimitMarkVisible(ThrustLimitType.Mct, false)).toBe(true);
    expect(egtLimitMarkVisible(ThrustLimitType.Clb, false)).toBe(true);
    expect(egtLimitMarkVisible(ThrustLimitType.Flex, false)).toBe(false);
    expect(egtLimitMarkVisible(ThrustLimitType.Toga, false)).toBe(false);
    expect(egtLimitMarkVisible(ThrustLimitType.Reverse, false)).toBe(false);
  });

  it('shows no amber limit mark and no amber EGT with the alpha floor protection active', () => {
    expect(egtLimitMarkVisible(ThrustLimitType.Clb, true)).toBe(false);
    expect(egtLimitMarkVisible(ThrustLimitType.Mct, true)).toBe(false);
    expect(egtColour(980, ThrustLimitType.Clb, EGT_LIMIT_C, 0, true)).toBe('Green');
  });

  it('turns the EGT red at the red line at once in alpha floor, without the takeoff tolerance', () => {
    expect(egtColour(1002, ThrustLimitType.Clb, EGT_LIMIT_C, 0, true)).toBe('Red');
    expect(egtColour(1002, ThrustLimitType.Toga, EGT_LIMIT_C, 0, true)).toBe('Red');
    expect(egtColour(1001, ThrustLimitType.Toga, EGT_LIMIT_C, 0, true)).toBe('Green');
  });

  it('the gauge hides the amber limit with alpha floor (autothrust mode A.FLOOR)', () => {
    const gauge = readFileSync(resolve(__dirname, 'EGT.tsx'), 'utf-8');
    expect(gauge).toContain("this.sub.on('fg.athr.mode')");
    expect(gauge).toContain('mode === AutoThrustMode.A_FLOOR');
    expect(gauge).toContain('egtLimitMarkVisible(limitType, alphaFloor)');
  });

  it('the gauge reads the thrust limit type, not the thrust lever angle', () => {
    const gauge = readFileSync(resolve(__dirname, 'EGT.tsx'), 'utf-8');
    expect(gauge).toContain("this.sub.on('thrust_limit_type')");
    expect(gauge).not.toContain('throttle_position_');
  });
});

/*
 * The EGT is red during takeoff at or above 1 022 °C, or at or above 1 002 °C for more than 20 s; during all other phases
 * at or above 1 002 °C.
 */
describe('EWD EGT red indication during takeoff', () => {
  it('is red at once from 1 022 °C at FLEX and TOGA', () => {
    expect(egtColour(1021, ThrustLimitType.Toga)).toBe('Green');
    expect(egtColour(1022, ThrustLimitType.Toga)).toBe('Red');
    expect(egtColour(1022, ThrustLimitType.Flex)).toBe('Red');
  });

  it('is red from 1 002 °C only after more than 20 s at or above it', () => {
    expect(egtColour(1010, ThrustLimitType.Toga, EGT_LIMIT_C, 0)).toBe('Green');
    expect(egtColour(1010, ThrustLimitType.Toga, EGT_LIMIT_C, 20)).toBe('Green');
    expect(egtColour(1010, ThrustLimitType.Toga, EGT_LIMIT_C, 20.1)).toBe('Red');
    expect(egtColour(1010, ThrustLimitType.Flex, EGT_LIMIT_C, 20.1)).toBe('Red');
    // below the red line the time does not matter
    expect(isEgtRed(1001, ThrustLimitType.Toga, 60)).toBe(false);
  });

  it('has no 20 s tolerance outside the takeoff', () => {
    expect(isEgtRed(1002, ThrustLimitType.Clb, 0)).toBe(true);
    expect(isEgtRed(1002, ThrustLimitType.Reverse, 0)).toBe(true);
    expect(isEgtRed(1001, ThrustLimitType.Clb, 60)).toBe(false);
  });
});

describe('EWD EGT time at or above the red line', () => {
  it('counts the time at or above 1 002 °C and restarts below it', () => {
    const timer = new EgtRedLineTimer();
    timer.update(1005, 10);
    expect(timer.secondsAtOrAboveRedLine).toBe(10);
    timer.update(1002, 10.5);
    expect(timer.secondsAtOrAboveRedLine).toBe(20.5);
    timer.update(1001, 0.1);
    expect(timer.secondsAtOrAboveRedLine).toBe(0);
  });

  it('a takeoff EGT of 1 010 °C goes red after 20 s', () => {
    const timer = new EgtRedLineTimer();
    for (let i = 0; i < 20; i++) {
      timer.update(1010, 1);
    }
    expect(egtColour(1010, ThrustLimitType.Toga, EGT_LIMIT_C, timer.secondsAtOrAboveRedLine)).toBe('Green');
    timer.update(1010, 0.5);
    expect(egtColour(1010, ThrustLimitType.Toga, EGT_LIMIT_C, timer.secondsAtOrAboveRedLine)).toBe('Red');
  });

  it('ignores a value that is not a finite number and a negative time step', () => {
    const timer = new EgtRedLineTimer();
    timer.update(1010, 5);
    timer.update(1010, -3);
    expect(timer.secondsAtOrAboveRedLine).toBe(5);
    timer.update(NaN, 1);
    expect(timer.secondsAtOrAboveRedLine).toBe(0);
  });

  it('the gauge colours the EGT it shows, with the time at or above the red line of the sim clock', () => {
    const gauge = readFileSync(resolve(__dirname, 'EGT.tsx'), 'utf-8');
    expect(gauge).toContain('new EgtRedLineTimer()');
    expect(gauge).toContain("this.sub.on('simTime')");
    expect(gauge).toContain('egtColour(egt, limitType, limit, seconds, alphaFloor)');
    // the colour follows the FADEC EGT as it is, as the FWS alert does
    expect(gauge).toMatch(
      /readonly egtColour = MappedSubject\.create\(\s*\([^)]*\]\) => egtColour\([^)]*\),\s*this\.egt,/,
    );
  });

  it('the red arc of the gauge starts at the red line', () => {
    const gauge = readFileSync(resolve(__dirname, 'EGT.tsx'), 'utf-8');
    expect(gauge).toContain('startAngle={this.redArcStartAngle}');
  });
});

describe('EWD EGT with the engine failures (stage B4)', () => {
  it('shows the FADEC EGT without an EEC trim: an EGT above the limits shows as it is', () => {
    expect(egtExceedanceShown(1100, EGT_LIMIT_C)).toBe(true);
    expect(isEgtRed(1100, ThrustLimitType.Clb, 0)).toBe(true);
    const gauge = readFileSync(resolve(__dirname, 'EGT.tsx'), 'utf-8');
    expect(gauge).toContain('{this.egt.map((egt) => Math.round(egt))}');
    const fws = readFileSync(
      resolve(__dirname, '../../../../systems-host/CpiomC/FlightWarningSystem/FwsCore.ts'),
      'utf-8',
    );
    expect(fws).toMatch(/displayedEgtDegrees = SimVar\.GetSimVarValue\(`L:A32NX_ENGINE_EGT:/);
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

  it('is the normal 970 °C limit with the engine running or off', () => {
    expect(egtLimit(1, true)).toBe(970);
    expect(egtLimit(1, false)).toBe(970);
    expect(egtLimit(0, true)).toBe(970);
  });

  it('turns a hot start amber above 745 °C', () => {
    expect(egtColour(760, ThrustLimitType.None, egtLimit(2, true))).toBe('Amber');
    expect(egtColour(700, ThrustLimitType.None, egtLimit(2, true))).toBe('Green');
    expect(egtColour(760, ThrustLimitType.None)).toBe('Green');
  });

  it('turns a relight amber above 865 °C', () => {
    expect(egtColour(880, ThrustLimitType.Clb, egtLimit(3, false))).toBe('Amber');
  });
});
