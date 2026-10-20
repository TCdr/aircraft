import { describe, expect, it } from 'vitest';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { ClimbStrategy } from '@fmgc/guidance/vnav/climb/ClimbStrategy';
import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { CruisePathBuilder } from '@fmgc/guidance/vnav/cruise/CruisePathBuilder';
import { DescentStrategy } from '@fmgc/guidance/vnav/descent/DescentStrategy';
import {
  NavGeometryProfile,
  ProfilePhase,
  VerticalCheckpointReason,
} from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';

const CRUISE_ALTITUDE = 25_000;
const START_OF_CRUISE_DISTANCE = 150;

function accelerationAtStartOfCruise(fuelOnBoard: Pounds) {
  const parameters = {
    zeroFuelWeight: 130_000,
    cruiseAltitude: CRUISE_ALTITUDE,
    managedCruiseSpeedMach: 0.78,
    tropoPause: 36_090,
    perfFactor: 0,
  };
  const observer = { get: () => parameters } as unknown as VerticalProfileComputationParametersObserver;
  const profile = {
    cruiseSteps: [],
    maxClimbSpeedConstraints: [],
    constantMachSegment: null,
    distanceToPresentPosition: 0,
    winds: { getCruiseTailwind: () => 0 },
  } as unknown as NavGeometryProfile;
  const speedProfile = { getTarget: () => 300 } as unknown as SpeedProfile;

  const sequence = new CruisePathBuilder(observer, new AtmosphericConditions(observer)).computeCruisePath(
    profile,
    A320AircraftConfig,
    {
      reason: VerticalCheckpointReason.TopOfClimb,
      distanceFromStart: START_OF_CRUISE_DISTANCE,
      altitude: CRUISE_ALTITUDE,
      secondsFromPresent: 1200,
      remainingFuelOnBoard: fuelOnBoard,
      speed: 250,
      mach: 0.78,
      profilePhase: ProfilePhase.Climb,
    },
    800,
    {} as ClimbStrategy,
    {} as DescentStrategy,
    speedProfile,
  );

  const acceleration = sequence.get().find((checkpoint) => checkpoint.speed === 300);

  return acceleration.distanceFromStart - START_OF_CRUISE_DISTANCE;
}

describe('CruisePathBuilder', () => {
  it('predicts a longer cruise acceleration for a heavier aircraft', () => {
    const lightAccelerationDistance = accelerationAtStartOfCruise(5_000);
    const heavyAccelerationDistance = accelerationAtStartOfCruise(40_000);

    expect(heavyAccelerationDistance).toBeGreaterThan(lightAccelerationDistance * 1.05);
  });
});
