// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The flight phase inhibition of the A380X ATC datalink alerts (ATC MSG pb light and RING aural alert).
 * - a380_fcom.txt l.95755 (DSC-46-10-10-10): "Inhibit the ATC MSG pb lighting and the aural signal during taxiing,
 *   takeoff, and landing."
 * - l.95759-95760: "If the aircraft receives a message during the inhibition period, the ATC center is automatically
 *   warned of the uplink message rejection."
 * - l.101523 (DSC-46-10-30, how to read an uplink message): "During takeoff and landing, the ATC MSG light and aural
 *   alert are inhibited."
 *
 * Design choices:
 * - The phases are the A380 FWS flight phases (L:A32NX_FWC_FLIGHT_PHASE, FwcFlightPhase of the A380X FWS): the A32NX
 *   FWC numbers its phases differently, this table is for the A380X mailbox only.
 * - The FCOM figure of the inhibited phases is not in the text. The two FCOM sentences differ on taxiing; this takes
 *   the takeoff and landing phases of l.101523, the same phases as the COMPANY MSG memo inhibition of the A380X FWS
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
