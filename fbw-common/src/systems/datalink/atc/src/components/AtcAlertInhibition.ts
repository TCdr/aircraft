// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The flight phase inhibition of the A380X ATC datalink alerts: the ATC MSG pb light and the RING aural alert are
 * inhibited during takeoff and landing, and an uplink received then is rejected with an automatic warning to the ATC
 * center.
 *
 * Design choices:
 * - The phases are the A380 FWS flight phases (L:A32NX_FWC_FLIGHT_PHASE, FwcFlightPhase of the A380X FWS): the A32NX
 *   FWC numbers its phases differently, this table is for the A380X mailbox only.
 * - The manual does not list the phases, and one of its sentences also names taxiing; this takes the takeoff and
 *   landing phases only, the same phases as the COMPANY MSG memo inhibition of the A380X FWS
 *   (FwsCompanyMessageAural.ts COMPANY_MSG_INHIBITED_FLIGHT_PHASES): phases 3 to 7 (takeoff power to 1500 ft) and 9 to
 *   10 (800 ft to 80 kt). Inhibiting the whole taxi would also reject the taxi and departure clearances.
 */

/** The A380 FWS flight phases (FwcFlightPhase) in which the ATC MSG light and RING are inhibited */
export const A380_ATC_ALERT_INHIBITED_FWS_PHASES: readonly number[] = [
  3, // 2nd engine takeoff power
  4, // at or above 80 kt
  5, // at or above V1
  6, // lift off
  7, // at or above 400 ft
  9, // at or below 800 ft
  10, // touchdown
];

/**
 * @param fwsFlightPhase the A380 FWS flight phase (L:A32NX_FWC_FLIGHT_PHASE)
 * @returns whether the ATC MSG light and the RING are inhibited, and a new uplink is rejected, in this phase
 */
export function isA380AtcAlertInhibited(fwsFlightPhase: number): boolean {
  return A380_ATC_ALERT_INHIBITED_FWS_PHASES.includes(fwsFlightPhase);
}
