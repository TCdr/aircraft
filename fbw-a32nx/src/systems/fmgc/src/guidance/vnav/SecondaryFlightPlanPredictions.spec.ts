// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import { ProfilePhase, VerticalWaypointPrediction } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import {
  missingSecondaryPlanInputs,
  SecondaryFlightPlanPredictions,
  SecondaryPredictionRules,
} from './SecondaryFlightPlanPredictions';
import { VerticalProfileComputationParameters } from './VerticalProfileComputationParameters';

const SEC1 = FlightPlanIndex.FirstSecondary;

function predictionsWith(rules: SecondaryPredictionRules) {
  const plan = { version: 3, destinationLegIndex: 2 };
  const service = { has: () => true, get: () => plan } as unknown as FlightPlanService;
  const predictions = new SecondaryFlightPlanPredictions(
    new EventBus(),
    service,
    {} as never,
    { fpmConfig: { NUM_SECONDARY_FLIGHT_PLANS: 1 } } as never,
    (() => {
      throw new Error('not computed in this test');
    }) as never,
    rules,
  );
  const leg = { profilePhase: ProfilePhase.Cruise } as VerticalWaypointPrediction;
  (predictions as unknown as { predictions: Map<number, unknown> }).predictions.set(SEC1, {
    planVersion: 3,
    legs: new Map([[2, leg]]),
    ageMs: 0,
  });
  return { predictions, plan, leg };
}

describe('the update rules of the secondary flight plan predictions', () => {
  it('removes the predictions when the rule says so', () => {
    const { predictions } = predictionsWith({ gate: () => 'clear' });
    predictions.update(3_000);
    expect(predictions.waypointPredictions(SEC1)).toBeNull();
  });

  it('keeps the predictions through a change of the flight plan when the rule freezes them', () => {
    const { predictions, plan, leg } = predictionsWith({ gate: () => 'freeze' });
    plan.version = 4;
    predictions.update(3_000);
    expect(predictions.waypointPredictions(SEC1)?.get(2)).toBe(leg);
  });

  it('does not keep predictions of a changed flight plan without the rule', () => {
    const { predictions, plan } = predictionsWith({});
    plan.version = 4;
    expect(predictions.waypointPredictions(SEC1)).toBeNull();
  });
});

describe('missingSecondaryPlanInputs', () => {
  const parameters = {
    flightPhase: 1,
    zeroFuelWeight: 1,
    fuelOnBoard: 1,
    cruiseAltitude: 1,
    thrustReductionAltitude: 1500,
    accelerationAltitude: 1500,
    approachSpeed: 135,
    flapRetractionSpeed: 170,
    slatRetractionSpeed: 190,
    cleanSpeed: 210,
  } as unknown as VerticalProfileComputationParameters;

  it('names what a flight plan lacks', () => {
    expect(missingSecondaryPlanInputs(parameters)).toEqual([]);
    expect(missingSecondaryPlanInputs({ ...parameters, zeroFuelWeight: NaN, approachSpeed: 0 })).toEqual([
      'approach speeds',
      'ZFW',
    ]);
    expect(missingSecondaryPlanInputs({ ...parameters, thrustReductionAltitude: 0 })).toEqual(['takeoff altitudes']);
  });
});
