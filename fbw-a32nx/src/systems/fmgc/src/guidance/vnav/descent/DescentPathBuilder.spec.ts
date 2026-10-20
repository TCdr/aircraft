// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import {
  ProfilePhase,
  VerticalCheckpoint,
  VerticalCheckpointReason,
} from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { TemporaryCheckpointSequence } from '@fmgc/guidance/vnav/profile/TemporaryCheckpointSequence';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { DescentPathBuilder } from './DescentPathBuilder';
import { RepressurizationSegmentBuilder, RepressurizationStepPredictor } from './RepressurizationSegment';

const point = (
  reason: VerticalCheckpointReason,
  distanceFromStart: number,
  secondsFromPresent: number,
  altitude: number,
): VerticalCheckpoint => ({
  reason,
  distanceFromStart,
  secondsFromPresent,
  altitude,
  remainingFuelOnBoard: 10000,
  speed: 280,
  mach: 0.78,
  profilePhase: ProfilePhase.Descent,
});

const observer = {
  get: () => ({ descentCabinRate: null, destinationElevation: 0, managedDescentSpeedMach: 0.78 }),
} as unknown as VerticalProfileComputationParametersObserver;

const fakeStep: RepressurizationStepPredictor = (from, cruiseAltitude) => {
  const minutes = (cruiseAltitude - from.altitude) / 1000;
  return {
    pathAngle: -2,
    verticalSpeed: -1000,
    timeElapsed: -60 * minutes,
    distanceTraveled: -5 * minutes,
    fuelBurned: -40 * minutes,
    finalAltitude: cruiseAltitude,
    speed: from.speed,
  };
};

/** A descent path builder whose idle path is 2500 ft/min at 300 kt from the decel point (3000 ft) up to FL370 */
function builder(): DescentPathBuilder {
  const descentPathBuilder = new DescentPathBuilder(observer, {} as AtmosphericConditions, A320AircraftConfig);
  const internals = descentPathBuilder as unknown as Record<string, unknown>;
  internals.idlePathBuilder = {
    buildIdlePath: (_profile: BaseGeometryProfile, sequence: TemporaryCheckpointSequence) => {
      sequence.push(
        point(VerticalCheckpointReason.IdlePathEnd, 280, 2800, 3000),
        point(VerticalCheckpointReason.CrossingDescentSpeedLimit, 250, 2632, 10000),
        point(VerticalCheckpointReason.IdlePathAtmosphericConditions, 240, 2512, 15000),
        point(VerticalCheckpointReason.IdlePathAtmosphericConditions, 220, 2272, 25000),
        point(VerticalCheckpointReason.IdlePathAtmosphericConditions, 210, 2152, 30000),
        point(VerticalCheckpointReason.TopOfDescent, 196, 1984, 37000),
      );
    },
  };
  internals.repressurizationSegmentBuilder = new RepressurizationSegmentBuilder(
    observer,
    {} as AtmosphericConditions,
    A320AircraftConfig,
    fakeStep,
  );
  return descentPathBuilder;
}

const profile = {
  descentAltitudeConstraints: [],
  descentSpeedConstraints: [],
  winds: { getDescentTailwind: () => 0 },
} as unknown as BaseGeometryProfile;

const approach = () =>
  new TemporaryCheckpointSequence(
    point(VerticalCheckpointReason.Landing, 300, 3000, 0),
    point(VerticalCheckpointReason.Decel, 280, 2800, 3000),
  );

const hasRepressurizationSegment = (sequence: TemporaryCheckpointSequence) =>
  sequence.checkpoints.some((checkpoint) => checkpoint.reason === VerticalCheckpointReason.RepressurizationSegmentEnd);

describe('managed descent path with a repressurization segment', () => {
  it('adds the segment to the full descent path', () => {
    const descentPathBuilder = builder();
    const sequence = approach();

    descentPathBuilder.computeManagedDescentPath(sequence, profile, {} as SpeedProfile, 37000);

    expect(hasRepressurizationSegment(sequence)).toBe(true);
    expect(descentPathBuilder.lastDescentCabinRate?.meanRate).toBeCloseTo(-350, 0);
  });

  it('leaves a sub-path to a constraint alone', () => {
    const descentPathBuilder = builder();
    const sequence = approach();

    descentPathBuilder.computeManagedDescentPath(sequence, profile, {} as SpeedProfile, Infinity, 150);

    expect(hasRepressurizationSegment(sequence)).toBe(false);
    expect(descentPathBuilder.lastDescentCabinRate).toBeNull();
  });
});
