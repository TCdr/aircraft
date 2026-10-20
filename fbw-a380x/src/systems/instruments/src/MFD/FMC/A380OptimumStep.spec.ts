// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { FmgcFlightPhase } from '@shared/flightphase';
import {
  a380OptimumStep,
  A380OptimumStepSearch,
  formatOptimumStepSavings,
  optimumStepAreaLabels,
} from './A380OptimumStep';
import type { FlightManagementComputer } from './FlightManagementComputer';

const context = { cruiseStart: 200, topOfDescent: 5_000, cruiseStartFuel: 330_000, steps: [] };
const target = {
  fromAltitude: 33_000,
  toAltitude: 37_000,
  currentStepDistance: null,
  nextStepDistance: null,
  stepLegIndex: null,
  isOptimum: false,
};
const conditions = { costIndex: 80, zeroFuelWeight: 360, isaDeviation: 0, headwind: 0, tropopause: 36_090 };

describe('A380 optimum step point', () => {
  it('finds a step point in the cruise of a long flight, with savings', () => {
    const optimum = a380OptimumStep(context, target, conditions);
    expect(optimum).not.toBe(null);
    expect(optimum!.distance).toBeGreaterThanOrEqual(220);
    expect(optimum!.distance).toBeLessThanOrEqual(4_700);
  });

  it('steps later when heavier', () => {
    const light = a380OptimumStep(context, target, conditions);
    const heavy = a380OptimumStep({ ...context, cruiseStartFuel: 400_000 }, target, conditions);
    expect(heavy?.distance ?? Infinity).toBeGreaterThan(light!.distance);
  });

  it('shows the savings with a minus sign, the costs with a plus sign, the time in minutes and seconds', () => {
    expect(formatOptimumStepSavings({ distance: 0, fuelSaving: 1102.3, timeSaving: 180 }, true)).toEqual({
      fuelSign: '-',
      fuel: '0.5',
      timeSign: '-',
      time: '03:00',
    });
    expect(formatOptimumStepSavings({ distance: 0, fuelSaving: 661.4, timeSaving: -382 }, true)).toEqual({
      fuelSign: '-',
      fuel: '0.3',
      timeSign: '+',
      time: '06:22',
    });
    expect(formatOptimumStepSavings({ distance: 0, fuelSaving: 2200, timeSaving: 0 }, false)).toEqual({
      fuelSign: '-',
      fuel: '2.2',
      timeSign: '',
      time: '00:00',
    });
    expect(formatOptimumStepSavings({ distance: 0, fuelSaving: 10, timeSaving: 0.4 }, true)).toEqual({
      fuelSign: '',
      fuel: '0.0',
      timeSign: '',
      time: '00:00',
    });
  });
});

/** An FMC with a cruise at FL330 from 200 NM to the T/D at 5000 NM, a waypoint every 500 NM */
function fakeFmc(timeConstraint: object | null = null) {
  const legs = Array.from({ length: 11 }, (_, index) => ({ isDiscontinuity: false, ident: `WPT${index}` }));
  const checkpoints: Partial<
    Record<VerticalCheckpointReason, { distanceFromStart: number; remainingFuelOnBoard: number }>
  > = {
    [VerticalCheckpointReason.TopOfClimb]: { distanceFromStart: 200, remainingFuelOnBoard: 330_000 },
    [VerticalCheckpointReason.TopOfDescent]: { distanceFromStart: 5_000, remainingFuelOnBoard: 60_000 },
    [VerticalCheckpointReason.PresentPosition]: { distanceFromStart: 0, remainingFuelOnBoard: 340_000 },
  };
  const cruiseFlightLevel = { value: 330, get: () => cruiseFlightLevel.value };
  const plan = {
    allLegs: legs,
    activeLegIndex: 1,
    performanceData: {
      cruiseFlightLevel,
      costIndex: { get: () => 80 },
      zeroFuelWeight: { get: () => 360 },
      tropopause: { get: () => 36_090 },
      cruiseTemperature: { get: () => null },
    },
  };
  const flightPlanInterface = {
    has: () => true,
    get: () => plan,
    active: plan,
    addOrUpdateCruiseStep: vi.fn(async () => {}),
    removeCruiseStep: vi.fn(async () => {}),
  };
  const fmc = {
    timeConstraintOf: () => timeConstraint,
    flightPlanInterface,
    guidanceController: {
      vnavDriver: {
        mcduProfile: {
          isReadyToDisplay: true,
          distanceToPresentPosition: 0,
          findVerticalCheckpoint: (reason: VerticalCheckpointReason) => checkpoints[reason],
          waypointPredictions: new Map(legs.map((_, index) => [index, { distanceFromAircraft: index * 500 }])),
        },
      },
    },
    fmgc: { data: { flightPhase: { get: () => FmgcFlightPhase.Preflight } } },
  };
  return { fmc: fmc as unknown as FlightManagementComputer, plan, cruiseFlightLevel, flightPlanInterface };
}

describe('A380 optimum step search (STEP ALTs panel)', () => {
  it('searches once for an entered step altitude and keeps the result', () => {
    const { fmc } = fakeFmc();
    const search = new A380OptimumStepSearch(fmc);
    search.enterStepAltitude(37_000);
    const first = search.area(FlightPlanIndex.Active).search;
    expect(first?.optimum).not.toBe(null);
    expect(search.area(FlightPlanIndex.Active).search).toBe(first);
  });

  it('searches again after a new cruise level', () => {
    const { fmc, cruiseFlightLevel } = fakeFmc();
    const search = new A380OptimumStepSearch(fmc);
    search.enterStepAltitude(37_000);
    const first = search.area(FlightPlanIndex.Active).search;
    cruiseFlightLevel.value = 310;
    const second = search.area(FlightPlanIndex.Active).search;
    expect(second).not.toBe(first);
    expect(second?.target.fromAltitude).toBe(31_000);
  });

  it('inserts the optimum step as an optimum, a distance before the waypoint after it', async () => {
    const { fmc, flightPlanInterface } = fakeFmc();
    const search = new A380OptimumStepSearch(fmc);
    search.enterStepAltitude(37_000);
    const { anchor } = search.area(FlightPlanIndex.Active).search!;
    await search.insert(FlightPlanIndex.Active);
    expect(flightPlanInterface.addOrUpdateCruiseStep).toHaveBeenCalledWith(
      anchor!.legIndex,
      37_000,
      FlightPlanIndex.Active,
      anchor!.distanceBeforeTermination,
      true,
    );
    expect(search.stepAltitudeEntry).toBe(null);
  });

  it('does not insert on legs that moved since the search', async () => {
    const { fmc, plan, flightPlanInterface } = fakeFmc();
    const search = new A380OptimumStepSearch(fmc);
    search.enterStepAltitude(37_000);
    const { anchor } = search.area(FlightPlanIndex.Active).search!;
    plan.allLegs[anchor!.legIndex] = { isDiscontinuity: false, ident: 'NEWWPT' };
    await search.insert(FlightPlanIndex.Active);
    expect(flightPlanInterface.addOrUpdateCruiseStep).not.toHaveBeenCalled();
  });
});

describe('A380 OPTIMUM STEP POINT area with a time constraint', () => {
  it('does not search while a time constraint exists in the flight plan', () => {
    const { fmc } = fakeFmc({ ident: 'WPT5', seconds: 36_000 });
    const search = new A380OptimumStepSearch(fmc);
    search.enterStepAltitude(37_000);
    const area = search.area(FlightPlanIndex.Active);
    expect(area).toEqual({ rtaExists: true, target: null, search: null });
    expect(optimumStepAreaLabels(area, false)).toEqual({
      message: 'OPTIMUM NOT AVAIL: RTA EXISTING',
      button: null,
      showOptimum: false,
    });
    search.newSearch(FlightPlanIndex.Active);
    expect(search.area(FlightPlanIndex.Active).search).toBe(null);
  });
});

describe('A380 OPTIMUM STEP POINT area labels', () => {
  const searchOf = (
    optimum: { distance: number; fuelSaving: number; timeSaving: number } | null,
    isNewSearch: boolean,
  ) => ({
    target: { ...target, isOptimum: isNewSearch },
    optimum,
    anchor: null,
    isNewSearch,
    anchorIdent: null,
    stepIdent: null,
  });

  it('offers INSERT AS OPT with the predictions of an optimum found', () => {
    const optimum = { distance: 900, fuelSaving: 1000, timeSaving: 60 };
    expect(optimumStepAreaLabels({ rtaExists: false, target, search: searchOf(optimum, false) }, false)).toEqual({
      message: '',
      button: 'INSERT AS OPT',
      showOptimum: true,
    });
  });

  it('shows OPTIMUM SELECTED without predictions for an inserted optimum step', () => {
    const inserted = { ...target, isOptimum: true };
    expect(optimumStepAreaLabels({ rtaExists: false, target: inserted, search: null }, true)).toEqual({
      message: 'OPTIMUM SELECTED',
      button: 'NEW SEARCH',
      showOptimum: false,
    });
  });

  it('shows NO NEW OPTIMUM STEP FOUND after a NEW SEARCH of an inserted optimum step without a better one', () => {
    const inserted = { ...target, isOptimum: true };
    expect(optimumStepAreaLabels({ rtaExists: false, target: inserted, search: searchOf(null, true) }, true)).toEqual({
      message: 'NO NEW OPTIMUM STEP FOUND',
      button: 'NEW SEARCH',
      showOptimum: false,
    });
  });

  it('shows NO OPTIMUM STEP FOUND for a step without an optimum, nothing before a step altitude entry', () => {
    expect(optimumStepAreaLabels({ rtaExists: false, target, search: searchOf(null, false) }, true).message).toBe(
      'NO OPTIMUM STEP FOUND',
    );
    expect(optimumStepAreaLabels({ rtaExists: false, target: null, search: null }, false)).toEqual({
      message: '',
      button: null,
      showOptimum: false,
    });
  });
});
