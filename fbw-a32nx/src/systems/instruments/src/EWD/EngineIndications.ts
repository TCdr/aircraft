// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ThrustLimitType } from '@shared/EngineLimits';
import { FadecEngineState } from './AvailIndication';

/*
 * Display rules of the EWD engine indications, A320 FCOM DSC-70-90-40-50 (a320_fcom.txt):
 * - EGT LIMIT, l.64263-64273: "The amber line indicates the maximum EGT (i.e. the EGT limit). [...] The EGT limit
 *   does not appear: When a takeoff or a go-around mode is selected, or When the thrust reversers are selected, or If
 *   the alpha floor protection is activated."
 * - THRUST LIMIT VALUE, l.64172: "The thrust limit value disappears when the thrust reversers are selected."
 * - FLEX TEMPERATURE, l.64179-64181 and l.64195-64196: cyan flexible temperature "when the FLX rating mode is selected",
 *   "Dashes in cyan: Indicates that the Static Air Temperature is above the flexible temperature."
 * - IDLE INDICATION, l.64203-64204: "Both engines are at idle speed, and the aircraft is in flight. Pulses during 10 s,
 *   and then remains steady."
 *
 * Design choices:
 * - The takeoff and go-around modes are the TOGA and FLX thrust limit types of the FADEC
 *   (L:A32NX_AUTOTHRUST_THRUST_LIMIT_TYPE, the rating mode shown on the EWD); the thrust reversers are selected when the
 *   thrust limit type is MREV (a thrust lever in the reverse range).
 * - In flight is FWC flight phases 5 (lift off) to 7 (approach), as before.
 * - At idle speed: N1 at most 2 % above the idle setting of the FADEC (L:A32NX_AUTOTHRUST_THRUST_LIMIT_IDLE: modulated
 *   idle with the bleed demand, or approach idle with the flaps out).
 */

/** l.64269-64273: the amber EGT limit line of the EGT gauge */
export function isEgtLimitLineVisible(thrustLimitType: number, alphaFloorActive: boolean): boolean {
  const takeoffOrGoAroundMode = thrustLimitType === ThrustLimitType.Toga || thrustLimitType === ThrustLimitType.Flex;
  const reversersSelected = thrustLimitType === ThrustLimitType.Mrev;
  return !takeoffOrGoAroundMode && !reversersSelected && !alphaFloorActive;
}

/** l.64172: the N1 limit value under the thrust rating mode */
export function isThrustLimitValueVisible(thrustLimitType: number): boolean {
  return thrustLimitType !== ThrustLimitType.Mrev;
}

/** The text of the flexible temperature under the thrust limit value, null when it is not shown */
export type FlexTemperatureText = string | null;

/** Cyan dashes in place of the flexible temperature, l.64195-64196 */
export const FLEX_TEMPERATURE_DASHES = '--';

/**
 * l.64179-64181, 64195-64196: the flexible temperature in FLX rating mode, cyan dashes when the static air temperature
 * is above it.
 * @param flexTemperature the flexible temperature entered in the FMS (L:A32NX_AIRLINER_TO_FLEX_TEMP), 0 when none
 * @param thrustLimitType L:A32NX_AUTOTHRUST_THRUST_LIMIT_TYPE
 * @param satValid the static air temperature of the ADR is valid
 * @param sat the static air temperature, in °C
 */
export function flexTemperatureText(
  flexTemperature: number,
  thrustLimitType: number,
  satValid: boolean,
  sat: number,
): FlexTemperatureText {
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
 * l.64203: the IDLE indication, both engines at idle speed in flight. The autothrust status is not part of the rule (it
 * was required to be active before).
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

/** L:A32NX_ENGINE_n_START_PHASE values of a crank (fadec_a32nx StartSequence_A32NX.hpp StartPhase) */
const START_PHASE_MOTORING = 1;
const START_PHASE_AUTOMATIC_CRANK = 3;
const START_PHASE_WET_CRANK = 5;

/** The grey background goes when the engine reaches idle: about 58.5 % N2 at ISA sea level */
const N2_START_BOX_END_PERCENT = 58.5;

/**
 * The grey box behind the N2 value: an engine start sequence or a crank (dry, wet, or the automatic dry crank after an
 * aborted start) is in progress.
 * @param n2 the N2 in percent
 * @param engineState L:A32NX_ENGINE_STATE
 * @param startPhase L:A32NX_ENGINE_n_START_PHASE
 */
export function isN2StartBoxVisible(n2: number, engineState: number, startPhase: number): boolean {
  const cranking =
    startPhase === START_PHASE_MOTORING ||
    startPhase === START_PHASE_AUTOMATIC_CRANK ||
    startPhase === START_PHASE_WET_CRANK;
  const startSequence = engineState === FadecEngineState.Starting || engineState === FadecEngineState.Restarting;
  return cranking || (startSequence && n2 < N2_START_BOX_END_PERCENT);
}
