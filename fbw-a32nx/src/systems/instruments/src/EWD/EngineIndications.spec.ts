// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ThrustLimitType } from '@shared/EngineLimits';
import {
  FLEX_TEMPERATURE_DASHES,
  flexTemperatureText,
  isEgtLimitLineVisible,
  isIdleIndicationVisible,
  isN2StartBoxVisible,
  isThrustLimitValueVisible,
  thrustRatingModeLabel,
} from './EngineIndications';

/* EWD engine indications: EGT limit, thrust limit value, flexible temperature, IDLE */
describe('EWD engine indications', () => {
  it('hides the amber EGT limit line in the takeoff and go-around modes (TOGA, FLX)', () => {
    expect(isEgtLimitLineVisible(ThrustLimitType.Toga, false)).toBe(false);
    expect(isEgtLimitLineVisible(ThrustLimitType.Flex, false)).toBe(false);
  });

  it('hides the amber EGT limit line with the thrust reversers selected (MREV)', () => {
    expect(isEgtLimitLineVisible(ThrustLimitType.Mrev, false)).toBe(false);
  });

  it('hides the amber EGT limit line with alpha floor active', () => {
    expect(isEgtLimitLineVisible(ThrustLimitType.Clb, true)).toBe(false);
  });

  it('shows the amber EGT limit line in CLB, MCT and without a rating mode', () => {
    expect(isEgtLimitLineVisible(ThrustLimitType.Clb, false)).toBe(true);
    expect(isEgtLimitLineVisible(ThrustLimitType.Mct, false)).toBe(true);
    expect(isEgtLimitLineVisible(ThrustLimitType.None, false)).toBe(true);
  });

  it('hides the thrust limit value with the thrust reversers selected', () => {
    expect(isThrustLimitValueVisible(ThrustLimitType.Mrev)).toBe(false);
    expect(isThrustLimitValueVisible(ThrustLimitType.Toga)).toBe(true);
    expect(isThrustLimitValueVisible(ThrustLimitType.Clb)).toBe(true);
  });

  it('shows cyan dashes when the SAT is above the flexible temperature', () => {
    // SAT 45 °C above a flex temperature of 30 °C
    expect(flexTemperatureText(30, ThrustLimitType.Flex, true, 45)).toBe(FLEX_TEMPERATURE_DASHES);
    // just above the flexible temperature
    expect(flexTemperatureText(30, ThrustLimitType.Flex, true, 31)).toBe(FLEX_TEMPERATURE_DASHES);
  });

  it('shows the flexible temperature in FLX mode when the SAT is at or below it', () => {
    expect(flexTemperatureText(54.4, ThrustLimitType.Flex, true, 15)).toBe('54');
    expect(flexTemperatureText(30, ThrustLimitType.Flex, true, 30)).toBe('30');
    // no valid SAT to compare with: the temperature is shown
    expect(flexTemperatureText(30, ThrustLimitType.Flex, false, 45)).toBe('30');
  });

  it('shows no flexible temperature outside FLX mode or without one entered', () => {
    expect(flexTemperatureText(54, ThrustLimitType.Toga, true, 15)).toBe(null);
    expect(flexTemperatureText(0, ThrustLimitType.Flex, true, 15)).toBe(null);
  });

  it('shows IDLE with both engines at idle in flight, autothrust off too', () => {
    // FWC flight phase 6, both N1 at idle
    expect(isIdleIndicationVisible(20, 20.5, 19.5, 6)).toBe(true);
    expect(isIdleIndicationVisible(20, 20.5, 19.5, 5)).toBe(true);
    expect(isIdleIndicationVisible(20, 20.5, 19.5, 7)).toBe(true);
  });

  it('shows no IDLE on ground or with one engine above idle', () => {
    expect(isIdleIndicationVisible(20, 20, 19.5, 8)).toBe(false);
    expect(isIdleIndicationVisible(20, 20, 19.5, 4)).toBe(false);
    expect(isIdleIndicationVisible(20, 40, 19.5, 6)).toBe(false);
  });

  it('shows the N2 grey box during a dry crank, a wet crank and the automatic crank after an abort', () => {
    // ENG MODE CRANK + MAN START ON with the ENG MASTER OFF: engine OFF, start phase MOTORING
    expect(isN2StartBoxVisible(20, 0, 1)).toBe(true);
    // the automatic dry crank after an aborted start
    expect(isN2StartBoxVisible(25, 2, 3)).toBe(true);
    // wet crank: ENG MASTER ON in CRANK
    expect(isN2StartBoxVisible(25, 0, 5)).toBe(true);
  });

  it('shows the N2 grey box during a start sequence until idle, not after it or after an abort', () => {
    expect(isN2StartBoxVisible(40, 2, 2)).toBe(true);
    expect(isN2StartBoxVisible(40, 3, 0)).toBe(true);
    expect(isN2StartBoxVisible(58.5, 2, 2)).toBe(false);
    expect(isN2StartBoxVisible(60, 1, 0)).toBe(false);
    expect(isN2StartBoxVisible(10, 0, 4)).toBe(false);
    expect(isN2StartBoxVisible(0, 0, 0)).toBe(false);
  });
});

describe('EWD thrust rating mode', () => {
  it('shows the derate level in place of FLX for a derated takeoff', () => {
    expect(thrustRatingModeLabel(ThrustLimitType.Flex, 4, 0, false)).toBe('D04');
    expect(thrustRatingModeLabel(ThrustLimitType.Flex, 32, 0, false)).toBe('D32');
    expect(thrustRatingModeLabel(ThrustLimitType.Flex, 0, 0, false)).toBe('FLX');
  });

  it('shows DCLB in place of CLB while the climb is derated', () => {
    expect(thrustRatingModeLabel(ThrustLimitType.Clb, 12, 12, false)).toBe('DCLB');
    expect(thrustRatingModeLabel(ThrustLimitType.Clb, 12, 0, false)).toBe('CLB');
  });

  it('shows GA SOFT in place of MCT with the soft go-around active', () => {
    expect(thrustRatingModeLabel(ThrustLimitType.Mct, 0, 0, true)).toBe('GA SOFT');
    expect(thrustRatingModeLabel(ThrustLimitType.Mct, 0, 0, false)).toBe('MCT');
  });

  it('keeps the rating label while the soft go-around flag is set outside the MCT limit', () => {
    expect(thrustRatingModeLabel(ThrustLimitType.Clb, 0, 0, true)).toBe('CLB');
    expect(thrustRatingModeLabel(ThrustLimitType.Flex, 12, 0, true)).toBe('D12');
  });

  it('keeps the other ratings', () => {
    expect(thrustRatingModeLabel(ThrustLimitType.Toga, 12, 12, true)).toBe('TOGA');
    expect(thrustRatingModeLabel(ThrustLimitType.Mrev, 0, 0, false)).toBe('MREV');
    expect(thrustRatingModeLabel(0, 0, 0, false)).toBe('');
  });
});
