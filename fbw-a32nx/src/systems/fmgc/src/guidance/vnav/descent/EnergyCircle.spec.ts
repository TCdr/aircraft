// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import {
  ProfilePhase,
  VerticalCheckpoint,
  VerticalCheckpointReason,
} from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { LateralMode } from '@shared/autopilot';
import { FmgcFlightPhase } from '@shared/flightphase';
import { EnergyCircleInputs, isEnergyCircleProvided, requiredDistanceToLand } from './EnergyCircle';

const a320Rule = A320AircraftConfig.vnavConfig.ENERGY_CIRCLE;
const a380Rule = A380AircraftConfig.vnavConfig.ENERGY_CIRCLE;

const point = (reason: VerticalCheckpointReason, distanceFromStart: number, altitude: number): VerticalCheckpoint => ({
  reason,
  distanceFromStart,
  altitude,
  secondsFromPresent: 0,
  remainingFuelOnBoard: 10000,
  speed: 250,
  mach: 0.78,
  profilePhase: ProfilePhase.Descent,
});

/** A descent profile from the T/D to the landing, with a level segment at 5000 ft for a constraint */
const descentProfile: VerticalCheckpoint[] = [
  point(VerticalCheckpointReason.TopOfDescent, 100, 35000),
  point(VerticalCheckpointReason.CrossingDescentSpeedLimit, 180, 10000),
  point(VerticalCheckpointReason.GeometricPathStart, 200, 5000),
  point(VerticalCheckpointReason.GeometricPathConstraint, 210, 5000),
  point(VerticalCheckpointReason.Decel, 220, 3000),
  point(VerticalCheckpointReason.Landing, 240, 0),
];

describe('required distance to land', () => {
  it('is the length of the descent profile from the present altitude to the landing', () => {
    expect(requiredDistanceToLand(descentProfile, 35000)).toBeCloseTo(140);
    expect(requiredDistanceToLand(descentProfile, 22500)).toBeCloseTo(100);
    expect(requiredDistanceToLand(descentProfile, 4000)).toBeCloseTo(25);
  });

  it('includes the level segment of a constraint below the aircraft, not when at its altitude', () => {
    expect(requiredDistanceToLand(descentProfile, 7500)).toBeCloseTo(50);
    expect(requiredDistanceToLand(descentProfile, 5000)).toBeCloseTo(30);
  });

  it('is the whole descent above the T/D, nothing at the landing altitude or without a profile', () => {
    expect(requiredDistanceToLand(descentProfile, 39000)).toBeCloseTo(140);
    expect(requiredDistanceToLand(descentProfile, 0)).toBeNull();
    expect(requiredDistanceToLand([], 10000)).toBeNull();
    expect(requiredDistanceToLand(descentProfile.slice(0, 3), 10000)).toBeNull();
  });
});

describe('energy circle display rule', () => {
  const descentInHdg: EnergyCircleInputs = {
    flightPhase: FmgcFlightPhase.Descent,
    lateralMode: LateralMode.HDG,
    distanceToDestination: 250,
  };

  it('A320: in descent and approach with HDG or TRK engaged', () => {
    expect(isEnergyCircleProvided(a320Rule, descentInHdg)).toBe(true);
    expect(isEnergyCircleProvided(a320Rule, { ...descentInHdg, lateralMode: LateralMode.TRACK })).toBe(true);
    expect(isEnergyCircleProvided(a320Rule, { ...descentInHdg, flightPhase: FmgcFlightPhase.Approach })).toBe(true);
  });

  it('A320: not in NAV, nor in cruise', () => {
    expect(isEnergyCircleProvided(a320Rule, { ...descentInHdg, lateralMode: LateralMode.NAV })).toBe(false);
    expect(isEnergyCircleProvided(a320Rule, { ...descentInHdg, flightPhase: FmgcFlightPhase.Cruise })).toBe(false);
  });

  it('A380: within 180 NM of the destination, in any lateral mode, in flight', () => {
    const nav = { ...descentInHdg, lateralMode: LateralMode.NAV };
    expect(isEnergyCircleProvided(a380Rule, nav)).toBe(false);
    expect(isEnergyCircleProvided(a380Rule, { ...nav, distanceToDestination: 180 })).toBe(true);
    expect(
      isEnergyCircleProvided(a380Rule, { ...nav, distanceToDestination: 120, flightPhase: FmgcFlightPhase.Cruise }),
    ).toBe(true);
    expect(
      isEnergyCircleProvided(a380Rule, { ...nav, distanceToDestination: 120, flightPhase: FmgcFlightPhase.Preflight }),
    ).toBe(false);
    expect(isEnergyCircleProvided(a380Rule, { ...nav, distanceToDestination: undefined })).toBe(false);
  });
});
