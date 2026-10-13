// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  displayedEgt,
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
  trimmedEgt,
} from './EgtLimits';

/* A380 FCOM DSC-70-90 EGT LIMIT / EGT RED LINE (a380_fcom.txt l.113170-113203): 970 °C amber, 1 002 °C red line */
describe('EWD EGT limits of the FCOM', () => {
  it('has the 970 °C EGT limit, the 1 002 °C red line and the takeoff values 1 022 °C / 20 s', () => {
    expect(EGT_LIMIT_C).toBe(970);
    expect(EGT_RED_LINE_C).toBe(1002);
    expect(EGT_TAKEOFF_RED_C).toBe(1022);
    expect(EGT_TAKEOFF_RED_LINE_SECONDS).toBe(20);
  });
});

/* A380 FCOM DSC-70-90 EGT INDICATIONS / EGT LIMIT: no amber indication during takeoff or with the reversers selected. */
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
    expect(egtLimitMarkVisible(ThrustLimitType.Mct)).toBe(true);
    expect(egtLimitMarkVisible(ThrustLimitType.Clb)).toBe(true);
    expect(egtLimitMarkVisible(ThrustLimitType.Flex)).toBe(false);
    expect(egtLimitMarkVisible(ThrustLimitType.Toga)).toBe(false);
    expect(egtLimitMarkVisible(ThrustLimitType.Reverse)).toBe(false);
  });

  it('trims the EGT at the red line at FLEX/TOGA, at the limit otherwise', () => {
    expect(trimmedEgt(990, ThrustLimitType.Toga)).toBe(990);
    expect(trimmedEgt(1050, ThrustLimitType.Toga)).toBe(1002);
    expect(trimmedEgt(1050, ThrustLimitType.Flex)).toBe(1002);
    expect(trimmedEgt(990, ThrustLimitType.Mct)).toBe(970);
    // the recorded EGT of a healthy engine (820-850 °C at takeoff, 720 °C in climb) is not trimmed
    expect(trimmedEgt(850, ThrustLimitType.Toga)).toBe(850);
    expect(trimmedEgt(720, ThrustLimitType.Clb)).toBe(720);
  });

  it('the gauge reads the thrust limit type, not the thrust lever angle', () => {
    const gauge = readFileSync(resolve(__dirname, 'EGT.tsx'), 'utf-8');
    expect(gauge).toContain("this.sub.on('thrust_limit_type')");
    expect(gauge).not.toContain('throttle_position_');
  });
});

/*
 * A380 FCOM DSC-70-90 EGT INDICATIONS (a380_fcom.txt l.113170-113177): "The EGT indication appears in red: During
 * takeoff, if the EGT is: At or above 1 022 °C, or At or above 1 002 °C, for more than 20 s. During all other phases, if
 * the EGT is at or above 1 002 °C."
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
    expect(gauge).toContain('egtColour(egt, limitType, limit, seconds)');
    // the colour follows the shown (trimmed) EGT, as the FWS alert does
    expect(gauge).toMatch(
      /readonly egtColour = MappedSubject\.create\(\s*\([^)]*\]\) => egtColour\([^)]*\),\s*this\.trimmedEGT,/,
    );
  });

  it('the red arc of the gauge starts at the red line', () => {
    const gauge = readFileSync(resolve(__dirname, 'EGT.tsx'), 'utf-8');
    expect(gauge).toContain('startAngle={this.redArcStartAngle}');
  });
});

describe('EWD EGT with the engine failures (stage B4)', () => {
  it('shows the trimmed EGT of a healthy engine', () => {
    expect(displayedEgt(1000, 0, ThrustLimitType.Mct)).toBe(970);
    expect(displayedEgt(800, 0, ThrustLimitType.Mct)).toBe(800);
  });

  it('adds the failure EGT offset on top of the EEC trim', () => {
    // the FADEC EGT includes the offset: 1 020 = 720 healthy + 300
    expect(displayedEgt(1020, 300, ThrustLimitType.Clb)).toBe(1020);
    // healthy 1 000 is trimmed to 970, plus 300
    expect(displayedEgt(1300, 300, ThrustLimitType.Clb)).toBe(1270);
  });

  it('a healthy engine never shows an EGT above the limits', () => {
    expect(egtExceedanceShown(displayedEgt(1100, 0, ThrustLimitType.Clb), 970)).toBe(false);
    expect(egtExceedanceShown(displayedEgt(1100, 0, ThrustLimitType.Toga), 1002)).toBe(false);
    expect(isEgtRed(displayedEgt(1100, 0, ThrustLimitType.Clb), ThrustLimitType.Clb, 0)).toBe(false);
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

  // a380_fcom.txt l.73512-73516: a parameter that is not available shows XX instead of its value
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

  it('has the FCOM N1 and N2 (FBW N3) red limits of 111 % and 118.7 %', () => {
    expect(n1Exceeds(111)).toBe(false);
    expect(n1Exceeds(111.1)).toBe(true);
    expect(n3Exceeds(118.7)).toBe(false);
    expect(n3Exceeds(118.8)).toBe(true);
  });
});

/* A380 FCOM DSC-70-90 EGT LIMIT (a380_fcom.txt l.113189-113192): 745 °C ground start, 865 °C relight in flight */
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

  it('shows the start EGT without the EEC trim, so a relight above 865 °C shows', () => {
    expect(displayedEgt(1000, 0, ThrustLimitType.Clb, true)).toBe(1000);
    expect(displayedEgt(1000, 0, ThrustLimitType.Clb)).toBe(970);
    expect(egtColour(displayedEgt(880, 0, ThrustLimitType.Clb, true), ThrustLimitType.Clb, egtLimit(3, false))).toBe(
      'Amber',
    );
  });
});
