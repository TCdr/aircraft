// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { VnavStepError } from '@fmgc/guidance/vnav/Predictions';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import {
  ProfilePhase,
  VerticalCheckpoint,
  VerticalCheckpointReason,
} from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { TemporaryCheckpointSequence } from '@fmgc/guidance/vnav/profile/TemporaryCheckpointSequence';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { AircraftConfig } from '@fmgc/flightplanning/AircraftConfigTypes';
import { DescentPathBuilder } from './DescentPathBuilder';
import { GeometricPathBuilder } from './GeometricPathBuilder';
import { PlannedGeometricSegment } from './GeometricPathPlanner';

// The flight model is not what is tested here: the strategy decelerates 4 NM in the idle descent when it may use the
// speedbrakes and, depending on the scenario, also without them
const flightModel = vi.hoisted(() => ({ decelerationWithoutSpeedbrakes: false, decelerationWithSpeedbrakes: true }));

vi.mock('@fmgc/guidance/vnav/climb/ClimbStrategy', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fmgc/guidance/vnav/climb/ClimbStrategy')>();
  class FlightPathAngleStrategy {
    public flightPathAngle = 0;

    predictToSpeed(
      altitude: number,
      targetSpeed: number,
      _initialSpeed: number,
      _mach: number,
      _fuelOnBoard: number,
      _headwind: number,
      config: { speedbrakesExtended: boolean },
    ) {
      const possible = config.speedbrakesExtended
        ? flightModel.decelerationWithSpeedbrakes
        : flightModel.decelerationWithoutSpeedbrakes;
      return {
        pathAngle: -3,
        verticalSpeed: -500,
        distanceTraveled: possible ? -4 : 0,
        fuelBurned: 0,
        timeElapsed: 0,
        finalAltitude: altitude,
        speed: targetSpeed,
        error: possible ? undefined : VnavStepError.AVAILABLE_GRADIENT_INSUFFICIENT,
      };
    }

    predictToDistance(altitude: number, distance: number, speed: number) {
      return {
        pathAngle: -3,
        verticalSpeed: -500,
        distanceTraveled: distance,
        fuelBurned: 0,
        timeElapsed: 0,
        finalAltitude: altitude,
        speed,
      };
    }
  }
  return { ...original, FlightPathAngleStrategy };
});

const MANAGED_DESCENT_SPEED = 280;

/** The point of the sequence the segment is built from (the sequence goes backwards, towards the aircraft) */
const startingCheckpoint: VerticalCheckpoint = {
  reason: VerticalCheckpointReason.Landing,
  distanceFromStart: 120,
  altitude: 3000,
  secondsFromPresent: 0,
  remainingFuelOnBoard: 5000,
  speed: 180,
  mach: 0.5,
  profilePhase: ProfilePhase.Descent,
};

describe('GeometricPathBuilder speedbrake decelerations', () => {
  const observer = {
    get: () => ({
      managedDescentSpeed: MANAGED_DESCENT_SPEED,
      managedDescentSpeedMach: 0.78,
      // below the starting altitude: not crossed in the geometric path
      descentSpeedLimit: { underAltitude: 1000, speed: 250 },
    }),
  } as unknown as VerticalProfileComputationParametersObserver;

  const computeManagedDescentPath = vi.fn();
  const descentPathBuilder = { computeManagedDescentPath } as unknown as DescentPathBuilder;

  const profile = (): BaseGeometryProfile =>
    ({
      descentSpeedConstraints: [],
      winds: { getDescentTailwind: () => 0 },
      speedbrakeDecelerationSegments: [],
    }) as unknown as BaseGeometryProfile;

  const segment = (): PlannedGeometricSegment =>
    ({
      gradient: 300,
      end: { distanceFromStart: 100, altitude: 9000, leg: { calculated: {} } },
    }) as unknown as PlannedGeometricSegment;

  const build = (geometricProfile: BaseGeometryProfile) => {
    const sequence = new TemporaryCheckpointSequence({ ...startingCheckpoint });
    new GeometricPathBuilder(
      observer,
      {} as AtmosphericConditions,
      descentPathBuilder,
      {} as AircraftConfig,
    ).executeGeometricSegments(sequence, [segment()], geometricProfile, {} as SpeedProfile);
    return sequence;
  };

  beforeEach(() => {
    flightModel.decelerationWithoutSpeedbrakes = false;
    flightModel.decelerationWithSpeedbrakes = true;
    computeManagedDescentPath.mockClear();
  });

  it('records the deceleration that only works with the speedbrakes', () => {
    const geometricProfile = profile();
    build(geometricProfile);
    // the deceleration is 4 NM long and ends where the descent is built from (120 NM, built backwards)
    expect(geometricProfile.speedbrakeDecelerationSegments).toEqual([
      { startDistanceFromStart: 116, endDistanceFromStart: 120 },
    ]);
  });

  it('records nothing when the clean deceleration works', () => {
    flightModel.decelerationWithoutSpeedbrakes = true;
    const geometricProfile = profile();
    build(geometricProfile);
    expect(geometricProfile.speedbrakeDecelerationSegments).toEqual([]);
  });

  it('records nothing when the speedbrakes do not help either, the path is too steep', () => {
    flightModel.decelerationWithSpeedbrakes = false;
    const geometricProfile = profile();
    build(geometricProfile);
    expect(geometricProfile.speedbrakeDecelerationSegments).toEqual([]);
    expect(computeManagedDescentPath).toHaveBeenCalled();
  });
});
