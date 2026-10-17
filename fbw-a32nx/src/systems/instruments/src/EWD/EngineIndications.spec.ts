// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ThrustLimitType } from '@shared/EngineLimits';
import {
  FLEX_TEMPERATURE_DASHES,
  flexTemperatureText,
  isEgtLimitLineVisible,
  isIdleIndicationVisible,
  isThrustLimitValueVisible,
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
});
