// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FmgcFlightPhase } from '@shared/flightphase';
import { RtaDeletionReason, RtaDeletionState, rtaAutoDeletion } from './RtaAutoDeletion';

const cruise: RtaDeletionState = {
  flightPhase: FmgcFlightPhase.Cruise,
  engineOut: false,
  clockValid: true,
  inHold: false,
  waypointInPlan: true,
  waypointAhead: true,
};

describe('rtaAutoDeletion', () => {
  it('keeps the RTA in normal flight', () => {
    expect(rtaAutoDeletion(FmgcFlightPhase.Climb, cruise, true)).toBeNull();
    expect(
      rtaAutoDeletion(FmgcFlightPhase.Cruise, { ...cruise, flightPhase: FmgcFlightPhase.Descent }, true),
    ).toBeNull();
  });

  it('deletes it with RTA DELETED: engine out, clock lost, hold, go around', () => {
    expect(rtaAutoDeletion(FmgcFlightPhase.Cruise, { ...cruise, engineOut: true }, false)).toEqual({
      reason: RtaDeletionReason.EngineOut,
      message: true,
    });
    expect(rtaAutoDeletion(FmgcFlightPhase.Cruise, { ...cruise, clockValid: false }, false)?.reason).toBe(
      RtaDeletionReason.ClockLost,
    );
    expect(rtaAutoDeletion(FmgcFlightPhase.Cruise, { ...cruise, inHold: true }, false)).toEqual({
      reason: RtaDeletionReason.Hold,
      message: true,
    });
    expect(
      rtaAutoDeletion(FmgcFlightPhase.Approach, { ...cruise, flightPhase: FmgcFlightPhase.GoAround }, false),
    ).toEqual({ reason: RtaDeletionReason.GoAround, message: true });
  });

  it('deletes it with RTA DELETED from descent or approach back to climb or cruise', () => {
    expect(rtaAutoDeletion(FmgcFlightPhase.Descent, cruise, false)).toEqual({
      reason: RtaDeletionReason.BackToClimbOrCruise,
      message: true,
    });
    expect(
      rtaAutoDeletion(FmgcFlightPhase.Approach, { ...cruise, flightPhase: FmgcFlightPhase.Climb }, false)?.reason,
    ).toBe(RtaDeletionReason.BackToClimbOrCruise);
  });

  it('deletes it when its waypoint is sequenced or removed: with the message on the A320 only', () => {
    expect(rtaAutoDeletion(FmgcFlightPhase.Cruise, { ...cruise, waypointAhead: false }, true)).toEqual({
      reason: RtaDeletionReason.WaypointSequenced,
      message: true,
    });
    expect(rtaAutoDeletion(FmgcFlightPhase.Cruise, { ...cruise, waypointAhead: false }, false)).toEqual({
      reason: RtaDeletionReason.WaypointSequenced,
      message: false,
    });
    expect(rtaAutoDeletion(FmgcFlightPhase.Cruise, { ...cruise, waypointInPlan: false }, false)).toEqual({
      reason: RtaDeletionReason.WaypointRemoved,
      message: false,
    });
  });
});
