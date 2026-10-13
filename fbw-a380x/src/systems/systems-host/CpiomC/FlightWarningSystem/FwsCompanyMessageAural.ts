// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FwcFlightPhase } from './FwsFlightPhases';

/*
 * The COMPANY MESSAGE synthetic voice of the A380 FWS.
 * - a380_fcom.txt l.73651-73652 (DSC-31-40-20 audio indicators): Company Message (Synthetic Voice), "Company message:
 *   The flight crew receives a company message.", "Sounds 1 time".
 * - l.108111-108120 (DSC-46-40-20 AOC aural alerts): COMPANY MESSAGE, "The flight crew has received a company
 *   message. It is associated with: The COMPANY MSG MEMO, or The COMPANY MSG: PRNTR MEMO."; inhibition: "The AOC
 *   inhibits the aural alert, when the aircraft goes below 10 000 ft in flight phase 8."
 *
 * The AOC (fbw-common datalink) counts the unread company messages in L:A32NX_COMPANY_MSG_COUNT, the source of the
 * COMPANY MSG memo (FwsMemos.ts '460000001'): a new message raises the count.
 *
 * Design choices:
 * - The voice goes with the COMPANY MSG memo (l.108113-108120): it is also inhibited in the flight phases where the
 *   memo is inhibited (takeoff and landing).
 * - A message received while the voice is inhibited is not said later (the FCOM inhibits the alert, it does not delay
 *   it), and the messages already there when the systems host starts are not said.
 * - Not done: COMPANY ALERT (urgent company message, l.73647-73649, 108122-108132) and CALL COMPANY
 *   (l.108134-108140): the AOC has no urgent or call-company messages.
 */

/** The flight phases where the COMPANY MSG memo (and its voice) are inhibited */
export const COMPANY_MSG_INHIBITED_FLIGHT_PHASES: readonly number[] = [
  FwcFlightPhase.SecondEngineTakeOffPower,
  FwcFlightPhase.AtOrAboveEightyKnots,
  FwcFlightPhase.AtOrAboveV1,
  FwcFlightPhase.LiftOff,
  FwcFlightPhase.AtOrAbove400Feet,
  FwcFlightPhase.AtOrBelow800Feet,
  FwcFlightPhase.TouchDown,
];

/** Below this altitude in flight phase 8 the voice is inhibited, feet (a380_fcom.txt l.108111-108116) */
export const COMPANY_MESSAGE_AURAL_MIN_ALTITUDE_FT = 10_000;

/**
 * @param flightPhase the FWS flight phase
 * @param altitudeFt the pressure altitude, feet, null when no ADR gives it
 * @returns whether the COMPANY MESSAGE voice is inhibited now (in flight phase 8 with no altitude: inhibited)
 */
export function isCompanyMessageAuralInhibited(flightPhase: number, altitudeFt: number | null): boolean {
  if (COMPANY_MSG_INHIBITED_FLIGHT_PHASES.includes(flightPhase)) {
    return true;
  }
  return (
    flightPhase === FwcFlightPhase.AtOrAbove1500FeetTo800Feet &&
    (altitudeFt === null || altitudeFt < COMPANY_MESSAGE_AURAL_MIN_ALTITUDE_FT)
  );
}

export class FwsCompanyMessageAural {
  /** The unread message count of the previous update, null before the first one */
  private previousUnreadCount: number | null = null;

  /**
   * @param unreadCount the number of unread company messages (L:A32NX_COMPANY_MSG_COUNT)
   * @param flightPhase the FWS flight phase
   * @param altitudeFt the pressure altitude, feet, null when no ADR gives it
   * @returns true when the COMPANY MESSAGE voice is to be said now
   */
  public update(unreadCount: number, flightPhase: number, altitudeFt: number | null): boolean {
    const newMessage = this.previousUnreadCount !== null && unreadCount > this.previousUnreadCount;
    this.previousUnreadCount = unreadCount;
    return newMessage && !isCompanyMessageAuralInhibited(flightPhase, altitudeFt);
  }
}
