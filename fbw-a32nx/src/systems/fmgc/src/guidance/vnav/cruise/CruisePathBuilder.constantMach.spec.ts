// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { ClimbStrategy } from '@fmgc/guidance/vnav/climb/ClimbStrategy';
import { DescentStrategy } from '@fmgc/guidance/vnav/descent/DescentStrategy';
import {
  NavGeometryProfile,
  ProfilePhase,
  VerticalCheckpoint,
  VerticalCheckpointReason,
} from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { Common } from '@fmgc/guidance/vnav/common';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { CruisePathBuilder } from './CruisePathBuilder';
import { GeographicConstantMachSegment } from './ConstantMachSpeedProfile';

const TROPOPAUSE = 36090;
const ECON_CAS = 290;
const ECON_MACH = 0.78;

function buildCruise(constantMachSegment: GeographicConstantMachSegment | null) {
  const observer = {
    get: () => ({
      zeroFuelWeight: 130_000,
      managedCruiseSpeed: ECON_CAS,
      managedCruiseSpeedMach: ECON_MACH,
      tropoPause: TROPOPAUSE,
      perfFactor: 0,
      cruiseAltitude: 35_000,
    }),
  } as unknown as VerticalProfileComputationParametersObserver;
  const atmosphericConditions = {
    isaDeviation: 0,
    computeCasFromMach: (altitude: number, mach: number) =>
      Common.machToCas(mach, Common.getDelta(altitude, altitude > TROPOPAUSE)),
  } as unknown as AtmosphericConditions;
  const profile = {
    cruiseSteps: [],
    maxClimbSpeedConstraints: [],
    constantMachSegment,
    distanceToPresentPosition: 0,
    winds: { getCruiseTailwind: () => 0 },
  } as unknown as NavGeometryProfile;
  const topOfClimb: VerticalCheckpoint = {
    reason: VerticalCheckpointReason.TopOfClimb,
    distanceFromStart: 50,
    altitude: 35_000,
    secondsFromPresent: 0,
    remainingFuelOnBoard: 30_000,
    speed: ECON_CAS,
    mach: ECON_MACH,
    profilePhase: ProfilePhase.Cruise,
  };
  const speedProfile = { getTarget: () => ECON_CAS } as unknown as SpeedProfile;

  return new CruisePathBuilder(observer, atmosphericConditions).computeCruisePath(
    profile,
    A320AircraftConfig,
    topOfClimb,
    400,
    null as unknown as ClimbStrategy,
    null as unknown as DescentStrategy,
    speedProfile,
  ).checkpoints;
}

/** The Mach the F-PLN shows at a waypoint: the profile interpolated at its distance */
function predictedMachAt(checkpoints: VerticalCheckpoint[], distanceFromStart: number): number {
  const profile: BaseGeometryProfile = Object.assign(Object.create(BaseGeometryProfile.prototype), {
    config: A320AircraftConfig,
    checkpoints,
  });

  return profile.interpolateEverythingFromStart(distanceFromStart).mach;
}

describe('the cruise predictions of a constant Mach segment', () => {
  it('fly the ECON Mach without a segment', () => {
    const checkpoints = buildCruise(null);

    expect(checkpoints.slice(1).map((c) => c.mach)).toEqual([ECON_MACH]);
  });

  it('fly the CMS Mach between its start and end, the ECON Mach outside', () => {
    const checkpoints = buildCruise({ startDistanceFromStart: 100, endDistanceFromStart: 300, mach: 0.82 });

    expect(checkpoints.slice(1).map((c) => [Math.round(c.distanceFromStart), c.mach, c.reason])).toEqual([
      [100, ECON_MACH, VerticalCheckpointReason.ConstantMachSegmentBoundary],
      [100, 0.82, VerticalCheckpointReason.ConstantMachSegmentBoundary],
      [300, 0.82, VerticalCheckpointReason.ConstantMachSegmentBoundary],
      [300, ECON_MACH, VerticalCheckpointReason.ConstantMachSegmentBoundary],
      [400, ECON_MACH, VerticalCheckpointReason.AtmosphericConditions],
    ]);
  });

  it('predict the ECON Mach at the start waypoint, the CMS Mach after it up to the end waypoint, ECON after it', () => {
    const checkpoints = buildCruise({ startDistanceFromStart: 100, endDistanceFromStart: 300, mach: 0.82 });

    expect(predictedMachAt(checkpoints, 100)).toBeCloseTo(ECON_MACH, 3);
    expect(predictedMachAt(checkpoints, 110)).toBeCloseTo(0.82, 3);
    expect(predictedMachAt(checkpoints, 300)).toBeCloseTo(0.82, 3);
    expect(predictedMachAt(checkpoints, 310)).toBeCloseTo(ECON_MACH, 3);
    expect(predictedMachAt(checkpoints, 390)).toBeCloseTo(ECON_MACH, 3);
  });

  it('predict a faster flight in a segment flown above the ECON Mach', () => {
    const checkpoints = buildCruise({ startDistanceFromStart: 100, endDistanceFromStart: 300, mach: 0.82 });
    const topOfClimb = checkpoints[0];
    const cmsStart = checkpoints.find((c) => Math.round(c.distanceFromStart) === 100) as VerticalCheckpoint;
    const cmsEnd = checkpoints.find((c) => Math.round(c.distanceFromStart) === 300) as VerticalCheckpoint;
    const econSecondsPerNm = (cmsStart.secondsFromPresent - topOfClimb.secondsFromPresent) / 50;
    const cmsSecondsPerNm = (cmsEnd.secondsFromPresent - cmsStart.secondsFromPresent) / 200;

    expect(cmsSecondsPerNm / econSecondsPerNm).toBeCloseTo(ECON_MACH / 0.82, 2);
  });
});
