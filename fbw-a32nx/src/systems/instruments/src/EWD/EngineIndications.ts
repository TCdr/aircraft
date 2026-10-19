// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ThrustLimitType } from '@shared/EngineLimits';

/*
 * Display rules of the EWD engine indications:
 * - EGT limit: an amber line at the maximum EGT, hidden in a takeoff or go-around mode, with the thrust reversers
 *   selected, or with the alpha floor protection active.
 * - Thrust limit value: hidden with the thrust reversers selected.
 * - Flexible temperature: cyan, in FLX rating mode; cyan dashes when the static air temperature is above it.
 * - IDLE: both engines at idle speed in flight; it pulses for 10 s, then stays steady.
 *
 * Design choices:
 * - The takeoff and go-around modes are the TOGA and FLX thrust limit types of the FADEC
 *   (L:A32NX_AUTOTHRUST_THRUST_LIMIT_TYPE, the rating mode shown on the EWD); the thrust reversers are selected when
 *   the thrust limit type is MREV (a thrust lever in the reverse range).
 * - In flight is FWC flight phases 5 (lift off) to 7 (approach).
 * - At idle speed: N1 at most 2 % above the idle setting of the FADEC (L:A32NX_AUTOTHRUST_THRUST_LIMIT_IDLE: modulated
 *   idle with the bleed demand, or approach idle with the flaps out).
 */

/** The amber EGT limit line of the EGT gauge */
export function isEgtLimitLineVisible(thrustLimitType: number, alphaFloorActive: boolean): boolean {
  const takeoffOrGoAroundMode = thrustLimitType === ThrustLimitType.Toga || thrustLimitType === ThrustLimitType.Flex;
  const reversersSelected = thrustLimitType === ThrustLimitType.Mrev;
  return !takeoffOrGoAroundMode && !reversersSelected && !alphaFloorActive;
}

/** The N1 limit value under the thrust rating mode */
export function isThrustLimitValueVisible(thrustLimitType: number): boolean {
  return thrustLimitType !== ThrustLimitType.Mrev;
}

/** Cyan dashes in place of the flexible temperature */
export const FLEX_TEMPERATURE_DASHES = '--';

/**
 * The flexible temperature in FLX rating mode, cyan dashes when the static air temperature is above it.
 * @param flexTemperature the flexible temperature entered in the FMS (L:A32NX_AIRLINER_TO_FLEX_TEMP), 0 when none
 * @param thrustLimitType L:A32NX_AUTOTHRUST_THRUST_LIMIT_TYPE
 * @param satValid the static air temperature of the ADR is valid
 * @param sat the static air temperature, in °C
 * @returns the text under the thrust limit value, null when the flexible temperature is not shown
 */
export function flexTemperatureText(
  flexTemperature: number,
  thrustLimitType: number,
  satValid: boolean,
  sat: number,
): string | null {
  if (thrustLimitType !== ThrustLimitType.Flex || flexTemperature === 0) {
    return null;
  }
  if (satValid && sat > flexTemperature) {
    return FLEX_TEMPERATURE_DASHES;
  }
  return Math.round(flexTemperature).toString();
}

/** The N1 margin above the idle N1 within which an engine is at idle speed, in percent */
export const IDLE_N1_MARGIN_PERCENT = 2;

/** FWC flight phases of the aircraft in flight: 5 lift off, 6 climb/cruise/descent, 7 approach */
const FWC_FLIGHT_PHASE_LIFT_OFF = 5;
const FWC_FLIGHT_PHASE_APPROACH = 7;

/**
 * The IDLE indication, both engines at idle speed in flight. The autothrust status is not part of the rule.
 */
export function isIdleIndicationVisible(
  engine1N1: number,
  engine2N1: number,
  idleN1: number,
  fwcFlightPhase: number,
): boolean {
  const idle = idleN1 + IDLE_N1_MARGIN_PERCENT;
  const inFlight = fwcFlightPhase >= FWC_FLIGHT_PHASE_LIFT_OFF && fwcFlightPhase <= FWC_FLIGHT_PHASE_APPROACH;
  return engine1N1 <= idle && engine2N1 <= idle && inFlight;
}
