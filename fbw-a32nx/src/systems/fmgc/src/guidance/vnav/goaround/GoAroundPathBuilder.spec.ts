// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import { NavGeometryProfile, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { GoAroundPathBuilder, onlyDestinationPrediction, predictGoAroundToDestination } from './GoAroundPathBuilder';

const inputs = {
  distance: 30,
  altitude: 3000,
  cas: 200,
  zeroFuelWeight: 140_000,
  fuelOnBoard: 20_000,
  isaDeviation: 0,
  tropoPause: 36_090,
  perfFactor: 0,
};

describe('the go-around prediction to the destination', () => {
  it.each([
    ['A320', A320AircraftConfig],
    ['A380', A380AircraftConfig],
  ])('burns fuel and takes time for the missed approach distance on the %s', (_, config) => {
    const { time, fuelBurned } = predictGoAroundToDestination(config, inputs);
    // 30 NM at about 200 kt TAS
    expect(time).toBeGreaterThan(400);
    expect(time).toBeLessThan(700);
    expect(fuelBurned).toBeGreaterThan(0);
    expect(fuelBurned).toBeLessThan(inputs.fuelOnBoard);
  });

  it('takes longer and burns more fuel for a longer distance', () => {
    const near = predictGoAroundToDestination(A320AircraftConfig, inputs);
    const far = predictGoAroundToDestination(A320AircraftConfig, { ...inputs, distance: 60 });
    expect(far.time).toBeCloseTo(2 * near.time, 0);
    expect(far.fuelBurned).toBeGreaterThan(near.fuelBurned);
  });

  it('predicts nothing without a distance left', () => {
    expect(predictGoAroundToDestination(A320AircraftConfig, { ...inputs, distance: 0 })).toEqual({
      time: 0,
      fuelBurned: 0,
    });
  });
});

describe('the predictions shown in the go-around phase', () => {
  const predictions = new Map([
    [3, 'missed approach'],
    [7, 'destination'],
  ]);

  it('are the destination only', () => {
    expect([...onlyDestinationPrediction(predictions, 7)]).toEqual([[7, 'destination']]);
  });

  it('are empty without a destination', () => {
    expect(onlyDestinationPrediction(predictions, null).size).toBe(0);
    expect(onlyDestinationPrediction(predictions, 9).size).toBe(0);
  });
});

describe('the go-around profile', () => {
  it('ends at the destination with the time and the fuel, and has no path to draw', () => {
    const observer = {
      get: () => ({ zeroFuelWeight: 140_000, cleanSpeed: 200, tropoPause: 36_090, perfFactor: 0 }),
    };
    const builder = new GoAroundPathBuilder(observer as never, { isaDeviation: 0 } as never);
    const profile = new NavGeometryProfile(
      new EventBus(),
      { get: () => ({ activeLegIndex: 1, firstMissedApproachLegIndex: 0 }) } as never,
      { planIndex: 0 } as never,
      {} as never,
      {} as never,
    );
    Object.defineProperty(profile, 'totalFlightPlanDistance', { get: () => 40 });
    Object.defineProperty(profile, 'distanceToPresentPosition', { get: () => 10 });
    profile.checkpoints.push({
      reason: VerticalCheckpointReason.PresentPosition,
      distanceFromStart: 10,
      secondsFromPresent: 0,
      altitude: 3000,
      remainingFuelOnBoard: 20_000,
      speed: 200,
      mach: 0.78,
      profilePhase: 0,
    });

    builder.buildGoAroundPath(profile, A320AircraftConfig, null);

    expect(profile.isDestinationOnly).toBe(true);
    expect(profile.isReadyToDisplay).toBe(true);
    expect(profile.getTimeToDestination()).toBeGreaterThan(400);
    expect(profile.getRemainingFuelAtDestination()).toBeLessThan(20_000);
    expect(profile.waypointPredictions.size).toBe(0);
  });
});
