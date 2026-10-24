// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import { VerticalCheckpoint, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { hasLiftedOff, TakeoffPathBuilder } from './TakeoffPathBuilder';

const parameters = (altitude: number) => ({
  presentPosition: { alt: altitude },
  departureElevation: 100,
  v2Speed: 140,
  fuelOnBoard: 20_000,
  zeroFuelWeight: 140_000,
  managedClimbSpeedMach: 0.78,
  tropoPause: 36_090,
  perfFactor: 0,
  thrustReductionAltitude: 1600,
  accelerationAltitude: 2100,
  takeoffFlapsSetting: 1,
});

function profileStub() {
  const checkpoints: VerticalCheckpoint[] = [];
  return {
    checkpoints,
    get lastCheckpoint() {
      return checkpoints[checkpoints.length - 1];
    },
    winds: { getClimbTailwind: () => 0 },
    addPresentPositionCheckpoint(position: { alt: number }, fuel: number, mach: number, speed: number) {
      checkpoints.push({
        reason: VerticalCheckpointReason.PresentPosition,
        distanceFromStart: 3,
        secondsFromPresent: 0,
        altitude: position.alt,
        remainingFuelOnBoard: fuel,
        speed,
        mach,
        profilePhase: 0,
      });
    },
  };
}

function build(altitude: number) {
  const builder = new TakeoffPathBuilder(
    { get: () => parameters(altitude) } as never,
    { isaDeviation: 0, predictStaticAirTemperatureAtAltitude: () => 15 } as never,
  );
  const profile = profileStub();
  builder.buildTakeoffPath(profile as never, A320AircraftConfig);
  return profile.checkpoints;
}

describe('the take-off profile', () => {
  it('knows when the aircraft is airborne', () => {
    expect(hasLiftedOff(120, 100)).toBe(false);
    expect(hasLiftedOff(400, 100)).toBe(true);
  });

  it('starts at the lift-off on the runway and passes the thrust reduction and acceleration altitudes', () => {
    const reasons = build(100).map((c) => c.reason);
    expect(reasons).toEqual([
      VerticalCheckpointReason.Liftoff,
      VerticalCheckpointReason.ThrustReductionAltitude,
      VerticalCheckpointReason.AccelerationAltitude,
    ]);
  });

  it('starts at the aircraft once airborne, with the time counted from now', () => {
    const checkpoints = build(900);
    expect(checkpoints[0].reason).toBe(VerticalCheckpointReason.PresentPosition);
    expect(checkpoints[0].altitude).toBe(900);
    expect(checkpoints[0].secondsFromPresent).toBe(0);
    expect(checkpoints.map((c) => c.reason)).not.toContain(VerticalCheckpointReason.Liftoff);
  });

  it('leaves out the altitudes the aircraft has passed', () => {
    const reasons = build(1800).map((c) => c.reason);
    expect(reasons).toEqual([VerticalCheckpointReason.PresentPosition, VerticalCheckpointReason.AccelerationAltitude]);
    expect(build(2500).map((c) => c.reason)).toEqual([VerticalCheckpointReason.PresentPosition]);
  });
});
