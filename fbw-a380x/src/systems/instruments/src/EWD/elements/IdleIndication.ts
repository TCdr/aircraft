// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The IDLE indication of the EWD: in flight, with at least three engines at idle; it pulses for 10 s, then stays
 * steady. It has no A/THR condition, so it also shows with the A/THR off.
 *
 * Design choices: an engine is at idle up to 2 % N1 above the idle N1, and "in flight" is FWC flight phases 6
 * (lift-off) to 9 (at or below 800 ft), see FwsFlightPhases FwcFlightPhase. The pulse is the CSS class IdleTextPulse.
 */

/** N1 margin above the idle N1 in which an engine counts as at idle, in percent */
export const IDLE_N1_MARGIN_PERCENT = 2;

/** FWC flight phases in flight: lift-off (6) to at or below 800 ft (9) */
const FIRST_FLIGHT_PHASE_IN_FLIGHT = 6;
const LAST_FLIGHT_PHASE_IN_FLIGHT = 9;

/**
 * @param n1Percent the N1 of the four engines, in percent
 * @param idleN1Percent the idle N1, in percent
 * @param fwcFlightPhase L:A32NX_FWC_FLIGHT_PHASE
 * @returns whether the EWD shows IDLE
 */
export function isIdleIndicationShown(n1Percent: number[], idleN1Percent: number, fwcFlightPhase: number): boolean {
  const inFlight = fwcFlightPhase >= FIRST_FLIGHT_PHASE_IN_FLIGHT && fwcFlightPhase <= LAST_FLIGHT_PHASE_IN_FLIGHT;
  const enginesAtIdle = n1Percent.filter((n1) => n1 <= idleN1Percent + IDLE_N1_MARGIN_PERCENT).length;
  return inFlight && enginesAtIdle >= 3;
}
