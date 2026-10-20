// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { EventBus, Subject } from '@microsoft/msfs-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import { VerticalProfileComputationParameters } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { VerticalWaypointPrediction } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import {
  SecondaryFlightPlanPredictions,
  SecondaryPlanData,
  canComputeSecondaryPlanProfile,
  secondaryPlanParameters,
} from './SecondaryFlightPlanPredictions';
import { FmgcDataService } from './fmgc';

const LBS_PER_TONNE = 2204.62;

// The sim's LatLongAlt class
vi.stubGlobal(
  'LatLongAlt',
  class {
    constructor(
      public lat: number,
      public long: number,
      public alt: number,
    ) {}
  },
);

const active = {
  presentPosition: new LatLongAlt(50, 8, 31000),
  flightPhase: FmgcFlightPhase.Cruise,
  fcuAltitude: 35000,
  zeroFuelWeight: 300 * LBS_PER_TONNE,
  fuelOnBoard: 120 * LBS_PER_TONNE,
  cruiseAltitude: 35000,
  departureElevation: 364,
  destinationElevation: 13,
  v2Speed: 160,
  accelerationAltitude: 1864,
  thrustReductionAltitude: 1864,
  originTransitionAltitude: 5000,
  estimatedDestinationFuel: 20 * LBS_PER_TONNE,
  approachSpeed: 140,
  flapRetractionSpeed: 180,
  slatRetractionSpeed: 200,
  cleanSpeed: 230,
  managedClimbSpeed: 300,
  managedClimbSpeedMach: 0.84,
  managedCruiseSpeed: 300,
  managedCruiseSpeedMach: 0.85,
  managedDescentSpeed: 300,
  managedDescentSpeedMach: 0.84,
  climbSpeedLimit: { speed: 250, underAltitude: 10000 },
  descentSpeedLimit: { speed: 250, underAltitude: 10000 },
  preselectedClbSpeed: 0,
  preselectedCruiseSpeed: 0,
  descentCabinRate: -500,
} as unknown as VerticalProfileComputationParameters;

const secondary = (d: Partial<SecondaryPlanData>): SecondaryPlanData => ({
  copiedFromActive: true,
  zeroFuelWeight: 310,
  fuelOnBoard: 118,
  cruiseAltitude: 39000,
  originElevation: 100,
  destinationElevation: 50,
  originLocation: { lat: 49, long: 2.5 },
  managedSpeeds: {
    managedClimbSpeed: 310,
    managedClimbSpeedMach: 0.85,
    managedCruiseSpeed: 310,
    managedCruiseSpeedMach: 0.86,
    managedDescentSpeed: 310,
    managedDescentSpeedMach: 0.85,
  },
  climbSpeedLimit: null,
  descentSpeedLimit: { speed: 250, underAltitude: 10000 },
  v2Speed: 165,
  accelerationAltitude: 1600,
  thrustReductionAltitude: 1600,
  transitionAltitude: 6000,
  preselectedClbSpeed: null,
  preselectedCruiseSpeed: 280,
  takeoffFlaps: 2,
  descentCabinRate: null,
  ...d,
});

describe('secondary flight plan prediction parameters', () => {
  it('the DES CABIN RATE of the secondary flight plan, not the one of the active flight plan', () => {
    expect(secondaryPlanParameters(active, secondary({})).descentCabinRate).toBe(null);
    expect(secondaryPlanParameters(active, secondary({ descentCabinRate: -300 })).descentCabinRate).toBe(-300);
  });

  it('a copy of the active flight plan: the current aircraft situation, with the data of the secondary flight plan', () => {
    const p = secondaryPlanParameters(active, secondary({}));
    expect(p.presentPosition).toBe(active.presentPosition);
    expect(p.flightPhase).toBe(FmgcFlightPhase.Cruise);
    expect(p.fcuAltitude).toBe(35000);
    expect(p.cruiseAltitude).toBe(39000);
    expect(p.zeroFuelWeight).toBeCloseTo(310 * LBS_PER_TONNE, -1);
    expect(p.fuelOnBoard).toBeCloseTo(118 * LBS_PER_TONNE, -1);
    expect(p.managedCruiseSpeedMach).toBe(0.86);
    expect(p.climbSpeedLimit).toBeNull();
    expect(p.preselectedCruiseSpeed).toBe(280);
    expect(p.estimatedDestinationFuel).toBe(active.estimatedDestinationFuel);
    // the approach data stay those of the active flight plan
    expect(p.approachSpeed).toBe(140);
  });

  it('a flight plan created on its INIT page: on ground before engine start at its origin', () => {
    const p = secondaryPlanParameters(active, secondary({ copiedFromActive: false }));
    expect(p.flightPhase).toBe(FmgcFlightPhase.Preflight);
    expect(p.presentPosition.lat).toBe(49);
    expect(p.presentPosition.long).toBe(2.5);
    expect(p.presentPosition.alt).toBe(100);
    expect(p.departureElevation).toBe(100);
    expect(p.estimatedDestinationFuel).toBeNull();
  });

  it('no predictions without ZFW, fuel or cruise level', () => {
    expect(canComputeSecondaryPlanProfile(secondaryPlanParameters(active, secondary({})))).toBe(true);
    expect(canComputeSecondaryPlanProfile(secondaryPlanParameters(active, secondary({ zeroFuelWeight: null })))).toBe(
      false,
    );
    expect(canComputeSecondaryPlanProfile(secondaryPlanParameters(active, secondary({ fuelOnBoard: null })))).toBe(
      false,
    );
    expect(
      canComputeSecondaryPlanProfile(
        secondaryPlanParameters(active, secondary({ copiedFromActive: false, cruiseAltitude: null })),
      ),
    ).toBe(false);
    // a copy of the active flight plan in descent keeps the last cruise level, as the active flight plan
    expect(secondaryPlanParameters(active, secondary({ cruiseAltitude: null })).cruiseAltitude).toBe(35000);
  });

  it('no predictions on ground without the takeoff altitudes', () => {
    const p = secondaryPlanParameters(active, secondary({ copiedFromActive: false }));
    expect(canComputeSecondaryPlanProfile(p)).toBe(true);
    expect(canComputeSecondaryPlanProfile({ ...p, thrustReductionAltitude: 0 })).toBe(false);
  });
});

describe('secondary flight plan predictions on the FMS pages', () => {
  const SEC1 = FlightPlanIndex.FirstSecondary;
  const destinationLegIndex = 7;
  const destination = {
    estimatedFuelOnBoard: 22 * LBS_PER_TONNE,
    secondsFromPresent: 3600,
  } as VerticalWaypointPrediction;

  function fmgcWithSecondary(copiedFromActive: boolean): FmgcDataService {
    const sec = {
      destinationLegIndex,
      isActiveOrCopiedFromActive: () => copiedFromActive,
      performanceData: { blockFuel: Subject.create(60), taxiFuel: Subject.create(1.5) },
    };
    const service = { has: (i: number) => i === SEC1, get: () => sec } as unknown as FlightPlanService;
    const fmgc = new FmgcDataService(new EventBus(), service);
    fmgc.secondaryPredictions = {
      waypointPredictions: (i: number) => (i === SEC1 ? new Map([[destinationLegIndex, destination]]) : null),
      destinationPrediction: (i: number) => (i === SEC1 ? destination : null),
    } as unknown as SecondaryFlightPlanPredictions;
    return fmgc;
  }

  it('the SEC destination prediction comes from the secondary flight plan predictions', () => {
    const fmgc = fmgcWithSecondary(true);
    expect(fmgc.getDestinationPrediction(SEC1)).toBe(destination);
    expect(fmgc.getWaypointPredictions(SEC1)?.get(destinationLegIndex)).toBe(destination);
    expect(fmgc.getDestinationPrediction(FlightPlanIndex.Temporary)).toBeNull();
  });

  it('SEC created on its INIT page: the predictions start with its BLOCK fuel, the EFOB at destination deducts its TAXI', () => {
    const fmgc = fmgcWithSecondary(false);
    expect(fmgc.isPlanIndependentOfAircraft(SEC1)).toBe(true);
    expect(fmgc.getPredictionStartFob(SEC1)).toBe(60);
    expect(fmgc.getDestEFOB(true, SEC1)).toBeCloseTo(22 - 1.5, 2);
  });
});

describe('SecondaryFlightPlanPredictions', () => {
  it('no predictions for a secondary flight plan without a destination prediction', () => {
    const service = { has: () => false } as unknown as FlightPlanService;
    const predictions = new SecondaryFlightPlanPredictions(
      new EventBus(),
      {} as FmgcDataService,
      service,
      {} as never,
      { fpmConfig: { NUM_SECONDARY_FLIGHT_PLANS: 3 } } as never,
    );
    expect(predictions.destinationPrediction(FlightPlanIndex.FirstSecondary)).toBeNull();
    expect(predictions.waypointPredictions(FlightPlanIndex.FirstSecondary)).toBeNull();
  });

  it('no predictions once the secondary flight plan changed, until they are computed again', () => {
    const plan = { version: 4, destinationLegIndex: 2 };
    const service = { has: () => true, get: () => plan } as unknown as FlightPlanService;
    const predictions = new SecondaryFlightPlanPredictions(
      new EventBus(),
      {} as FmgcDataService,
      service,
      {} as never,
      { fpmConfig: { NUM_SECONDARY_FLIGHT_PLANS: 3 } } as never,
    );
    const destination = { secondsFromPresent: 600 } as VerticalWaypointPrediction;
    (predictions as unknown as { predictions: Map<number, unknown> }).predictions.set(FlightPlanIndex.FirstSecondary, {
      planVersion: 4,
      legs: new Map([[2, destination]]),
      ageMs: 0,
    });
    expect(predictions.destinationPrediction(FlightPlanIndex.FirstSecondary)).toBe(destination);
    plan.version = 5;
    expect(predictions.destinationPrediction(FlightPlanIndex.FirstSecondary)).toBeNull();
    expect(predictions.waypointPredictions(FlightPlanIndex.FirstSecondary)).toBeNull();
  });
});
