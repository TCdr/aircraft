// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { TurnDirection } from '@flybywiresim/fbw-sdk';
import { HoldData, HoldType } from '@fmgc/flightplanning/data/flightplan';

/**
 * HOLD at the present position (PPOS): a manual hold (HM) whose hold fix is the aircraft position when the hold is
 * inserted.
 *
 * The crew opens the HOLD page from a lateral revision at the present position (A320) or at the FROM waypoint (A380).
 * A computed hold has the inbound course of the leg to the hold fix (at PPOS: the aircraft track), right turns, and a
 * 1 min outbound leg below 14 000 ft, 1.5 min above.
 */

/** The computed hold has a 1 min outbound leg up to this altitude, 1.5 min above, ft */
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
