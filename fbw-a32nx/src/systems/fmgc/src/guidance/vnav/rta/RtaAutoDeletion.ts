// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FmgcFlightPhase } from '@shared/flightphase';

export enum RtaDeletionReason {
  EngineOut,
  ClockLost,
  Hold,
  GoAround,
  BackToClimbOrCruise,
  WaypointSequenced,
  WaypointRemoved,
}

export interface RtaDeletion {
  reason: RtaDeletionReason;
  /** whether the RTA DELETED message is displayed */
  message: boolean;
}

/** The state the automatic deletion rules look at, once per FMS cycle */
export interface RtaDeletionState {
  flightPhase: FmgcFlightPhase;
  engineOut: boolean;
  clockValid: boolean;
  /**
   * The aircraft is in the hold that deletes the RTA, or in its deceleration zone (A320: any hold; A380: a hold with
   * manual termination)
   */
  inHold: boolean;
  /** the RTA waypoint is still in the flight plan */
  waypointInPlan: boolean;
  /** the RTA waypoint is the TO waypoint or after it */
  waypointAhead: boolean;
}

/**
 * The automatic deletion of the RTA:
 * - with the RTA DELETED message, on both aircraft: engine out, aircraft clock lost, hold, go around, and a return
 *   from descent or approach to climb or cruise;
 * - when its waypoint is sequenced, cleared, or replaced by an ABEAM waypoint: with the message on the A320, without it
 *   on the A380.
 * @param previousPhase the flight phase of the previous cycle, null on the first one
 * @param messageOnWaypointLoss whether the loss of the RTA waypoint raises RTA DELETED
 * @returns the deletion, or null when the RTA stays
 */
export function rtaAutoDeletion(
  previousPhase: FmgcFlightPhase | null,
  state: RtaDeletionState,
  messageOnWaypointLoss: boolean,
): RtaDeletion | null {
  if (state.engineOut) {
    return { reason: RtaDeletionReason.EngineOut, message: true };
  }
  if (!state.clockValid) {
    return { reason: RtaDeletionReason.ClockLost, message: true };
  }
  if (state.flightPhase === FmgcFlightPhase.GoAround) {
    return { reason: RtaDeletionReason.GoAround, message: true };
  }
  if (
    (previousPhase === FmgcFlightPhase.Descent || previousPhase === FmgcFlightPhase.Approach) &&
    (state.flightPhase === FmgcFlightPhase.Climb || state.flightPhase === FmgcFlightPhase.Cruise)
  ) {
    return { reason: RtaDeletionReason.BackToClimbOrCruise, message: true };
  }
  if (state.inHold) {
    return { reason: RtaDeletionReason.Hold, message: true };
  }
  if (!state.waypointInPlan) {
    return { reason: RtaDeletionReason.WaypointRemoved, message: messageOnWaypointLoss };
  }
  if (!state.waypointAhead) {
    return { reason: RtaDeletionReason.WaypointSequenced, message: messageOnWaypointLoss };
  }
  return null;
}
