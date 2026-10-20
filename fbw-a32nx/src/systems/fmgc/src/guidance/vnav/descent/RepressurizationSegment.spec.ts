// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import {
  ProfilePhase,
  VerticalCheckpoint,
  VerticalCheckpointReason,
} from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { TemporaryCheckpointSequence } from '@fmgc/guidance/vnav/profile/TemporaryCheckpointSequence';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { cruiseCabinAltitude, requiredDescentSeconds } from './CabinRepressurization';
import {
  planRepressurizationSegment,
  RepressurizationSegmentBuilder,
  RepressurizationStepPredictor,
} from './RepressurizationSegment';

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

/**
 * A descent built backwards (landing first): an idle path at 2500 ft/min and 300 kt ground speed above the speed limit
 * crossing at FL100, up to the T/D at FL370. 1098 s from the T/D to the landing.
 */
const idleDescent = (): VerticalCheckpoint[] => [
  point(VerticalCheckpointReason.Landing, 300, 3000, 0),
  point(VerticalCheckpointReason.IdlePathEnd, 280, 2800, 3000),
  point(VerticalCheckpointReason.CrossingDescentSpeedLimit, 250, 2550, 10000),
  point(VerticalCheckpointReason.IdlePathAtmosphericConditions, 240, 2430, 15000),
  point(VerticalCheckpointReason.IdlePathAtmosphericConditions, 230, 2310, 20000),
  point(VerticalCheckpointReason.IdlePathAtmosphericConditions, 220, 2190, 25000),
  point(VerticalCheckpointReason.IdlePathAtmosphericConditions, 210, 2070, 30000),
  point(VerticalCheckpointReason.IdlePathAtmosphericConditions, 200, 1950, 35000),
  point(VerticalCheckpointReason.TopOfDescent, 196, 1902, 37000),
];

describe('repressurization segment plan', () => {
  it('adds nothing when the descent is long enough', () => {
    expect(planRepressurizationSegment(idleDescent(), 0, -1000)).toBeNull();
  });

  it('ends where the 1000 ft/min segment adds the missing time', () => {
    // Each ft of the segment adds 60/1000 - 60/2500 s
    const plan = planRepressurizationSegment(idleDescent(), 60, -1000);

    expect(plan.end.reason).toBe(VerticalCheckpointReason.RepressurizationSegmentEnd);
    expect(plan.end.altitude).toBeCloseTo(37000 - 60 / 0.036, -1);
    expect(plan.addedSeconds).toBeCloseTo(60, 0);
    expect(plan.keptCheckpointCount).toBe(8);
    expect(plan.end.distanceFromStart).toBeGreaterThan(196);
    expect(plan.end.distanceFromStart).toBeLessThan(200);
  });

  it('stops at the first speed change of the idle path when even the longest segment is too short', () => {
    const plan = planRepressurizationSegment(idleDescent(), 5000, -1000);

    expect(plan.end.altitude).toBe(10000);
    expect(plan.keptCheckpointCount).toBe(3);
    expect(plan.addedSeconds).toBeCloseTo(0.036 * 27000, 0);
  });

  it('adds nothing when the segment would be faster than the idle path', () => {
    expect(planRepressurizationSegment(idleDescent(), 60, -5000)).toBeNull();
  });
});

describe('repressurization segment builder', () => {
  // The step backwards from the end of the segment up to the cruise level, at 300 kt ground speed
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

  const builderWith = (descentCabinRate: number | null) =>
    new RepressurizationSegmentBuilder(
      {
        get: () => ({ descentCabinRate, destinationElevation: 0, managedDescentSpeedMach: 0.78 }),
      } as unknown as VerticalProfileComputationParametersObserver,
      {} as AtmosphericConditions,
      A320AircraftConfig,
      fakeStep,
    );

  const profile = { winds: { getDescentTailwind: () => 0 } } as unknown as BaseGeometryProfile;

  const cabinDescent = cruiseCabinAltitude(37000, 0, A320AircraftConfig.vnavConfig.CABIN_PRESSURIZATION);

  it('moves the T/D back until the cabin descends at 350 ft/min', () => {
    const sequence = new TemporaryCheckpointSequence(...idleDescent());
    expect(requiredDescentSeconds(cabinDescent, -350)).toBeGreaterThan(1098);

    const result = builderWith(null).build(sequence, profile);

    expect(result.maxRate).toBe(-350);
    expect(result.descentSeconds).toBeCloseTo(requiredDescentSeconds(cabinDescent, -350), -1);
    expect(result.meanRate).toBeCloseTo(-350, 0);
    expect(sequence.lastCheckpoint.reason).toBe(VerticalCheckpointReason.TopOfDescent);
    expect(sequence.lastCheckpoint.altitude).toBe(37000);
    expect(sequence.lastCheckpoint.distanceFromStart).toBeLessThan(196);
    expect(sequence.checkpoints[sequence.checkpoints.length - 2].reason).toBe(
      VerticalCheckpointReason.RepressurizationSegmentEnd,
    );
    expect(result.descentDistance).toBeCloseTo(300 - sequence.lastCheckpoint.distanceFromStart);
  });

  it('keeps the idle descent when the cabin rate entered is high enough', () => {
    const sequence = new TemporaryCheckpointSequence(...idleDescent());

    const result = builderWith(-900).build(sequence, profile);

    expect(sequence.checkpoints).toEqual(idleDescent());
    expect(result.descentSeconds).toBe(1098);
    expect(result.meanRate).toBeCloseTo(-cabinDescent / (1098 / 60));
  });
});
