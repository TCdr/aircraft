// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320AircraftConfig, A320EconParameters } from '@fmgc/flightplanning/A320AircraftConfig';
import {
  computeOptimumStep,
  OptimumStepInputs,
  OptimumStepModel,
  optimumStepAnchor,
  optimumStepTarget,
  stepPointSecondsFromPresent,
  StepProfileContext,
  stepProfileContext,
} from './OptimumStep';
import { KG_PER_LB, tonnesToPounds } from './EconSpeeds';
import { FlightModel } from './FlightModel';
import { NavGeometryProfile, VerticalCheckpointReason } from './profile/NavGeometryProfile';

const a320: OptimumStepModel = {
  config: A320AircraftConfig,
  aircraft: A320EconParameters,
  minSpeedAt: (altitude, weight) => FlightModel.getGreenDotSpeedCas(altitude, weight * KG_PER_LB),
  maxAltitudeAt: () => 39_000,
};

/** FL350 to FL390, cruise from 150 NM to the T/D at 2400 NM */
const cruise: OptimumStepInputs = {
  costIndex: 30,
  fromAltitude: 35_000,
  toAltitude: 39_000,
  cruiseStartWeight: tonnesToPounds(64),
  isaDeviation: 0,
  headwind: 0,
  tropopause: 36_090,
  cruiseStart: 150,
  topOfDescent: 2_400,
  nextStepDistance: null,
  currentStepDistance: null,
};

describe('optimum step point', () => {
  it('is at the start of the search, 20 NM beyond the T/C, when the step level is already better', () => {
    const step = computeOptimumStep(a320, cruise);
    expect(step?.distance).toBe(170);
    expect(step!.fuelSaving).toBeGreaterThan(100 / KG_PER_LB);
  });

  it('waits for the weight at which the step level becomes better', () => {
    const step = computeOptimumStep(a320, { ...cruise, cruiseStartWeight: tonnesToPounds(72) });
    expect(step?.distance).toBeGreaterThan(500);
    expect(step?.distance).toBeLessThan(2_100);
  });

  it('waits until the step altitude is not above the max altitude', () => {
    const heavyLimit: OptimumStepModel = {
      ...a320,
      maxAltitudeAt: (weight) => (weight > tonnesToPounds(62) ? 37_000 : 41_000),
    };
    const step = computeOptimumStep(heavyLimit, cruise);
    // about 2 t burnt at about 10 lb per NM
    expect(step?.distance).toBeGreaterThan(450);
  });

  it('proposes nothing when the crew step is already at the optimum', () => {
    const optimum = computeOptimumStep(a320, cruise)!;
    expect(computeOptimumStep(a320, { ...cruise, currentStepDistance: optimum.distance })).toBe(null);
  });

  it('gives the savings against a later crew step', () => {
    const step = computeOptimumStep(a320, { ...cruise, currentStepDistance: 1_500 });
    expect(step?.distance).toBe(170);
    expect(step!.fuelSaving).toBeGreaterThan(0);
  });

  it('ends the search 20 NM before the next step and 300 NM before the T/D', () => {
    expect(computeOptimumStep(a320, { ...cruise, topOfDescent: 450 })).toBe(null);
    const beforeNextStep = computeOptimumStep(a320, {
      ...cruise,
      cruiseStartWeight: tonnesToPounds(72),
      nextStepDistance: 1_400,
    });
    expect(beforeNextStep === null || beforeNextStep.distance <= 1_380).toBe(true);
  });

  it('has no optimum for a step descent or without a cost index', () => {
    expect(computeOptimumStep(a320, { ...cruise, toAltitude: 31_000 })).toBe(null);
    expect(computeOptimumStep(a320, { ...cruise, costIndex: NaN })).toBe(null);
  });
});

describe('optimum step search inputs', () => {
  const context: StepProfileContext = {
    cruiseStart: 100,
    topOfDescent: 2_000,
    cruiseStartFuel: 30_000,
    steps: [],
  };

  it('searches the entered altitude without a step in the flight plan', () => {
    expect(optimumStepTarget(context, 35_000, 39_000)).toEqual({
      fromAltitude: 35_000,
      toAltitude: 39_000,
      currentStepDistance: null,
      nextStepDistance: null,
      stepLegIndex: null,
      isOptimum: false,
    });
    expect(optimumStepTarget(context, 35_000, 33_000)).toBe(null);
    expect(optimumStepTarget(context, 35_000, null)).toBe(null);
  });

  it('searches the first step ahead when it is a step climb', () => {
    const withSteps = {
      ...context,
      steps: [
        { legIndex: 7, distance: 600, toAltitude: 37_000, isOptimum: false },
        { legIndex: 12, distance: 1_200, toAltitude: 39_000, isOptimum: false },
      ],
    };
    expect(optimumStepTarget(withSteps, 35_000, null)).toMatchObject({
      toAltitude: 37_000,
      currentStepDistance: 600,
      nextStepDistance: 1_200,
      stepLegIndex: 7,
    });
    expect(
      optimumStepTarget(
        { ...context, steps: [{ legIndex: 7, distance: 600, toAltitude: 33_000, isOptimum: false }] },
        35_000,
        null,
      ),
    ).toBe(null);
  });

  it('places the optimum point before the first free waypoint after it', () => {
    const legs = [
      { isDiscontinuity: false },
      { isDiscontinuity: false },
      {
        isDiscontinuity: false,
        cruiseStep: { distanceBeforeTermination: 0, toAltitude: 37_000, waypointIndex: 2, isIgnored: false },
      },
      { isDiscontinuity: false },
    ];
    const distances = new Map([
      [1, 100],
      [2, 300],
      [3, 450],
    ]);
    expect(optimumStepAnchor(250, distances, legs, null)).toEqual({ legIndex: 3, distanceBeforeTermination: 200 });
    // the step being moved frees its own waypoint
    expect(optimumStepAnchor(250, distances, legs, 2)).toEqual({ legIndex: 2, distanceBeforeTermination: 50 });
    expect(optimumStepAnchor(500, distances, legs, null)).toBe(null);
  });

  it('reads the T/C, the T/D, the fuel at the T/C and the steps from the profile', () => {
    const checkpoints = {
      [VerticalCheckpointReason.TopOfClimb]: { distanceFromStart: 160, remainingFuelOnBoard: 28_000 },
      [VerticalCheckpointReason.TopOfDescent]: { distanceFromStart: 1_060, remainingFuelOnBoard: 12_000 },
      [VerticalCheckpointReason.PresentPosition]: { distanceFromStart: 10, remainingFuelOnBoard: 30_000 },
    };
    const profile = {
      isReadyToDisplay: true,
      distanceToPresentPosition: 10,
      findVerticalCheckpoint: (reason: VerticalCheckpointReason) => checkpoints[reason],
      waypointPredictions: new Map([[3, { distanceFromAircraft: 500 }]]),
    } as unknown as NavGeometryProfile;
    const legs = [
      { isDiscontinuity: false },
      { isDiscontinuity: false },
      { isDiscontinuity: false },
      {
        isDiscontinuity: false,
        cruiseStep: {
          distanceBeforeTermination: 20,
          toAltitude: 37_000,
          waypointIndex: 3,
          isIgnored: false,
          isOptimum: true,
        },
      },
    ];
    expect(stepProfileContext(profile, legs, 1)).toEqual({
      cruiseStart: 150,
      topOfDescent: 1_050,
      cruiseStartFuel: 28_000,
      steps: [{ legIndex: 3, distance: 480, toAltitude: 37_000, isOptimum: true }],
    });
  });
});

describe('the time at a step point', () => {
  it('is the profile time at the step point, before its waypoint', () => {
    const profile = { interpolateTimeAtDistance: (distance: number) => distance * 8 } as unknown as NavGeometryProfile;
    expect(stepPointSecondsFromPresent(profile, 500, 30)).toBe(470 * 8);
  });
});
