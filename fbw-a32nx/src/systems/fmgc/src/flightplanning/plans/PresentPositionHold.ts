// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { TurnDirection } from '@flybywiresim/fbw-sdk';
import { HoldData, HoldType } from '@fmgc/flightplanning/data/flightplan';

/**
 * HOLD at the present position (PPOS): a manual hold (HM) whose hold fix is the aircraft position when the hold is
 * inserted.
 *
 * A320 FCOM DSC-22_20-30-10-18 PROCEDURE TO INSERT A HOLD (a320_fcom.txt l.14070-14075): "The HOLD prompt enables the
 * crew to enter a holding pattern, with manual termination (HM), at the revised waypoint or at the present position.
 * The crew accesses the HOLD page from a lateral revision at the present position (PPOS), or at a waypoint."
 * A320 FCOM HOLD page (l.18227-18230): a computed hold has "INB CRS = INBD TRK of the F-PLN leg leading to the revised
 * waypoint", "TURN = Turn direction right", "TIME on outbound leg is 1.5 min above 14 000 ft, 1 min below 14 000 ft".
 * A380 FCOM DSC-22-FMS-10-40-50 HOLD (a380_fcom.txt l.25351-25352): "To insert an HM at P.POS, the flight crew performs
 * the lateral revision on the flight plan FROM waypoint."; COMPUTED HOLD (l.25374-25380): "Inbound course: Track of the
 * flight plan leg preceding the holding fix, or the aircraft bearing if the holding fix is P.POS", "Turn side: RIGHT",
 * "Leg size: 1 minute if the predicted aircraft altitude at the hold is below 14 000 ft, or 1.5 min if the altitude is
 * above 14 000 ft."
 */

/** FCOM: the computed hold has a 1 min outbound leg below 14 000 ft, 1.5 min above */
const COMPUTED_HOLD_TIME_ALTITUDE = 14_000;

/**
 * The computed hold at the present position: the inbound course is the aircraft track (the aircraft is on the inbound
 * course when it reaches the hold fix, which is where it is), right turns, 1 or 1.5 min legs.
 * @param magneticTrack the aircraft magnetic track, degrees
 * @param altitude the aircraft altitude, feet
 */
export function presentPositionComputedHold(magneticTrack: number, altitude: number): HoldData {
  return {
    inboundMagneticCourse: ((Math.round(magneticTrack) % 360) + 360) % 360,
    turnDirection: TurnDirection.Right,
    time: altitude <= COMPUTED_HOLD_TIME_ALTITUDE ? 1 : 1.5,
    type: HoldType.Computed,
  };
}
