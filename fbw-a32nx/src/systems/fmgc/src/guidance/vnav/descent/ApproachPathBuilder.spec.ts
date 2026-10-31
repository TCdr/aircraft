// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AltitudeDescriptor } from '@flybywiresim/fbw-sdk';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { NavGeometryProfile } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { AircraftConfig } from '@fmgc/flightplanning/AircraftConfigTypes';
import { ApproachPathBuilder } from './ApproachPathBuilder';

// The flight model is not what is tested here. The descent from the altitude constraint covers more distance than
// there is to the constraint (the aircraft would be too high) unless the speedbrakes are used, which steepen it.
const flightModel = vi.hoisted(() => ({ idleDescentNm: { clean: 55, withSpeedbrakes: 30 } }));

vi.mock('@fmgc/guidance/vnav/climb/ClimbStrategy', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fmgc/guidance/vnav/climb/ClimbStrategy')>();
  class FlightPathAngleStrategy {
    public flightPathAngle = 0;

    predictToSpeed(altitude: number, targetSpeed: number) {
      return {
        pathAngle: 0,
        verticalSpeed: 0,
        distanceTraveled: -2,
        fuelBurned: 0,
        timeElapsed: 0,
        finalAltitude: altitude,
        speed: targetSpeed,
      };
    }

    predictToDistance(altitude: number, distance: number, speed: number) {
      return {
        pathAngle: 0,
        verticalSpeed: 0,
        distanceTraveled: -Math.abs(distance),
        fuelBurned: 0,
        timeElapsed: 0,
        finalAltitude: altitude,
        speed,
      };
    }
  }
  return { ...original, FlightPathAngleStrategy };
});

vi.mock('@fmgc/guidance/vnav/descent/DescentStrategy', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fmgc/guidance/vnav/descent/DescentStrategy')>();
  class IdleDescentStrategy {
    predictToAltitude(
      _initialAltitude: number,
      finalAltitude: number,
      initialSpeed: number,
      _mach: number,
      _fuelOnBoard: number,
      _headwind: number,
      config: { speedbrakesExtended: boolean },
    ) {
      return {
        pathAngle: -3,
        verticalSpeed: -1000,
        distanceTraveled: -(config.speedbrakesExtended
          ? flightModel.idleDescentNm.withSpeedbrakes
          : flightModel.idleDescentNm.clean),
        fuelBurned: 0,
        timeElapsed: 0,
        finalAltitude,
        speed: initialSpeed,
      };
    }
  }
  return { ...original, IdleDescentStrategy };
});

const DESTINATION_DISTANCE_FROM_START = 200;
const CONSTRAINT_DISTANCE_FROM_START = 150;

describe('ApproachPathBuilder speedbrake decelerations', () => {
  const observer = {
    get: () => ({
      approachSpeed: 140,
      cleanSpeed: 220,
      slatRetractionSpeed: 200,
      flapRetractionSpeed: 180,
      managedDescentSpeedMach: 0.78,
    }),
  } as unknown as VerticalProfileComputationParametersObserver;

  const speedProfile = {
    getMaxDescentSpeedConstraint: () => null,
    getTargetWithoutConstraints: () => 250,
    getTarget: () => 250,
  } as unknown as SpeedProfile;

  /** The profile with an AT OR ABOVE 5000 ft constraint 50 NM before the destination */
  const profile = () =>
    ({
      finalAltitude: 1000,
      finalDescentAngle: 3,
      fafDistanceToEnd: 5,
      getDistanceFromStart: (distanceToEnd: number) => DESTINATION_DISTANCE_FROM_START - distanceToEnd,
      winds: { getDescentTailwind: () => 0 },
      speedbrakeDecelerationSegments: [],
      descentAltitudeConstraints: [
        {
          distanceFromStart: CONSTRAINT_DISTANCE_FROM_START,
          constraint: { altitudeDescriptor: AltitudeDescriptor.AtOrAboveAlt1, altitude1: 5000 },
        },
      ],
    }) as unknown as NavGeometryProfile;

  const build = (approachProfile: NavGeometryProfile) =>
    new ApproachPathBuilder(observer, {} as AtmosphericConditions, {} as AircraftConfig).computeApproachPath(
      approachProfile,
      speedProfile,
      3000,
      0,
    );

  beforeEach(() => {
    flightModel.idleDescentNm = { clean: 55, withSpeedbrakes: 30 };
  });

  it('records the segment that only works with the speedbrakes, from the constraint to the descent start', () => {
    const approachProfile = profile();
    build(approachProfile);
    expect(approachProfile.speedbrakeDecelerationSegments).toHaveLength(1);
    const segment = approachProfile.speedbrakeDecelerationSegments[0];
    expect(segment.startDistanceFromStart).toBe(CONSTRAINT_DISTANCE_FROM_START);
    // the descent is built backwards from the FAF
    expect(segment.endDistanceFromStart).toBeGreaterThan(CONSTRAINT_DISTANCE_FROM_START);
  });

  it('records nothing when the constraint is met without the speedbrakes', () => {
    flightModel.idleDescentNm = { clean: 30, withSpeedbrakes: 20 };
    const approachProfile = profile();
    build(approachProfile);
    expect(approachProfile.speedbrakeDecelerationSegments).toEqual([]);
  });
});
