// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A380AircraftConfig, A380EconParameters } from '@fmgc/flightplanning/A380AircraftConfig';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { isaDeviationAt, ISA_TROPOPAUSE_ALTITUDE, KG_PER_LB } from '@fmgc/guidance/vnav/EconSpeeds';
import {
  computeOptimumStep,
  OptimumStep,
  OptimumStepAnchor,
  optimumStepAnchor,
  OptimumStepConditions,
  optimumStepInputs,
  OptimumStepTarget,
  optimumStepTarget,
  StepProfileContext,
  stepProfileContext,
  waypointDistancesAhead,
} from '@fmgc/guidance/vnav/OptimumStep';
import { FmgcFlightPhase } from '@shared/flightphase';
import { A380AltitudeUtils } from '@shared/OperatingAltitudes';
import { maxCertifiedAlt } from '@shared/PerformanceConstants';
import { a380GreenDotSpeed } from './CruiseSpeeds';
import type { FlightManagementComputer } from './FlightManagementComputer';

/**
 * The optimum step point of the STEP ALTs panel, with the A380 ECON cruise, green dot and REC MAX (at the weight of
 * the step point).
 * @returns the optimum, or null when no step point saves more than 100 kg or 1 min
 */
export function a380OptimumStep(
  context: StepProfileContext,
  target: OptimumStepTarget,
  conditions: OptimumStepConditions,
): OptimumStep | null {
  const tonnes = (pounds: number) => (pounds * KG_PER_LB) / 1000;
  return computeOptimumStep(
    {
      config: A380AircraftConfig,
      aircraft: A380EconParameters,
      minSpeedAt: (altitude, weight) => a380GreenDotSpeed(altitude, tonnes(weight)),
      maxAltitudeAt: (weight) =>
        Math.min(
          A380AltitudeUtils.calculateRecommendedMaxAltitude(weight * KG_PER_LB, conditions.isaDeviation),
          maxCertifiedAlt,
        ),
    },
    optimumStepInputs(context, target, conditions),
  );
}

/** The fuel and time savings of the OPTIMUM STEP POINT area, each with its sign apart */
export interface A380OptimumStepSavingsText {
  fuelSign: string;
  /** in thousands of the weight unit, one decimal */
  fuel: string;
  timeSign: string;
  /** MM:SS */
  time: string;
}

/**
 * The savings as the panel shows them: a minus sign for a saving, a plus sign for an additional cost.
 * Design choice: the time as minutes and seconds, a step changes the flight time by a few minutes.
 * @param metric fuel in tonnes, else in thousands of pounds
 */
export function formatOptimumStepSavings(optimum: OptimumStep, metric: boolean): A380OptimumStepSavingsText {
  const sign = (rounded: number) => (rounded > 0 ? '+' : rounded < 0 ? '-' : '');
  const fuelCost = Number(((-optimum.fuelSaving * (metric ? KG_PER_LB : 1)) / 1000).toFixed(1));
  const timeCost = -Math.round(optimum.timeSaving);
  const seconds = Math.abs(timeCost);
  return {
    fuelSign: sign(fuelCost),
    fuel: Math.abs(fuelCost).toFixed(1),
    timeSign: sign(timeCost),
    time: `${Math.floor(seconds / 60)
      .toFixed(0)
      .padStart(2, '0')}:${(seconds % 60).toFixed(0).padStart(2, '0')}`,
  };
}

/** The result of a search of the optimum step point */
export interface A380OptimumStepSearchResult {
  /** the step whose optimum point was searched */
  target: OptimumStepTarget;
  optimum: OptimumStep | null;
  /** where the optimum step goes in the flight plan, null without an optimum */
  anchor: OptimumStepAnchor | null;
  /** the search was a NEW SEARCH of an inserted optimum step */
  isNewSearch: boolean;
  /** the idents of the legs of the anchor and of the step optimised, to check them at the insertion */
  anchorIdent: string | null;
  stepIdent: string | null;
}

/** What the OPTIMUM STEP POINT area of the STEP ALTs panel shows */
export interface A380OptimumStepArea {
  /** a time constraint exists: no optimum step point */
  rtaExists: boolean;
  /** the step searched, null without a step climb (or entered step altitude) to search */
  target: OptimumStepTarget | null;
  /** the last search for this target, null before it */
  search: A380OptimumStepSearchResult | null;
}

/** The labels of the OPTIMUM STEP POINT area */
export interface A380OptimumStepAreaLabels {
  message: string;
  /** null without a button */
  button: 'INSERT AS OPT' | 'NEW SEARCH' | null;
  /** the predictions and savings of an optimum found and not inserted yet */
  showOptimum: boolean;
}

/**
 * The message, button and predictions of the OPTIMUM STEP POINT area
 * @param area null when the area is not available (secondary flight plans)
 * @param hasSteps the flight plan has a step
 */
export function optimumStepAreaLabels(area: A380OptimumStepArea | null, hasSteps: boolean): A380OptimumStepAreaLabels {
  if (area?.rtaExists) {
    return { message: 'OPTIMUM NOT AVAIL: RTA EXISTING', button: null, showOptimum: false };
  }
  const target = area?.target ?? null;
  const search = area?.search ?? null;
  if (search?.optimum) {
    return { message: '', button: 'INSERT AS OPT', showOptimum: true };
  }
  const button = target !== null ? 'NEW SEARCH' : null;
  if (search?.isNewSearch) {
    return { message: 'NO NEW OPTIMUM STEP FOUND', button, showOptimum: false };
  }
  if (target?.isOptimum) {
    return { message: 'OPTIMUM SELECTED', button, showOptimum: false };
  }
  return { message: target || !area || hasSteps ? 'NO OPTIMUM STEP FOUND' : '', button, showOptimum: false };
}

/**
 * The optimum step point search of the active flight plan. The search runs when the step altitude is entered, when
 * the step to optimise changes, and on NEW SEARCH; its result stays until the next search.
 */
export class A380OptimumStepSearch {
  /** The step altitude entered without a step in the flight plan, in feet */
  private enteredAltitude: number | null = null;

  private lastSearch: A380OptimumStepSearchResult | null = null;

  constructor(private readonly fmc: FlightManagementComputer) {}

  get stepAltitudeEntry(): number | null {
    return this.enteredAltitude;
  }

  /** Enters (or clears with null) the step altitude for a search without a step in the flight plan */
  enterStepAltitude(altitude: number | null): void {
    this.enteredAltitude = altitude;
    this.lastSearch = null;
  }

  /**
   * The area of the panel; searches once for a new step to optimise (not for an inserted optimum step)
   * @param planIndex the active or the temporary flight plan
   */
  area(planIndex: FlightPlanIndex): A380OptimumStepArea {
    const rtaExists = this.fmc.timeConstraintOf(planIndex) !== null;
    const inputs = rtaExists ? null : this.searchInputs(planIndex);
    const target = inputs?.target ?? null;
    if (!inputs || !target) {
      return { rtaExists, target: null, search: null };
    }
    if (!this.isSearchOf(target) && !target.isOptimum) {
      this.runSearch(planIndex, inputs.context, target, false);
    }
    return { rtaExists, target, search: this.isSearchOf(target) ? this.lastSearch : null };
  }

  /** NEW SEARCH */
  newSearch(planIndex: FlightPlanIndex): void {
    if (this.fmc.timeConstraintOf(planIndex) !== null) {
      return;
    }
    const inputs = this.searchInputs(planIndex);
    if (inputs?.target) {
      this.runSearch(planIndex, inputs.context, inputs.target, inputs.target.isOptimum);
    }
  }

  /**
   * INSERT AS OPT: the optimum step point replaces the step it optimises (in a temporary flight plan). A flight plan
   * changed since the search moves the legs: the search then runs again instead.
   */
  async insert(planIndex: FlightPlanIndex): Promise<void> {
    const search = this.lastSearch;
    if (!search?.optimum || !search.anchor) {
      return;
    }
    const flightPlanInterface = this.fmc.flightPlanInterface;
    const { target, anchor } = search;
    const plan = flightPlanInterface.get(planIndex);
    if (
      legIdent(plan.allLegs, anchor.legIndex) !== search.anchorIdent ||
      legIdent(plan.allLegs, target.stepLegIndex) !== search.stepIdent
    ) {
      this.lastSearch = null;
      return;
    }
    if (target.stepLegIndex !== null && target.stepLegIndex !== anchor.legIndex) {
      await flightPlanInterface.removeCruiseStep(target.stepLegIndex, FlightPlanIndex.Active);
    }
    await flightPlanInterface.addOrUpdateCruiseStep(
      anchor.legIndex,
      target.toAltitude,
      FlightPlanIndex.Active,
      anchor.distanceBeforeTermination,
      true,
    );
    this.enteredAltitude = null;
    this.lastSearch = null;
  }

  private isSearchOf(target: OptimumStepTarget): boolean {
    const searched = this.lastSearch?.target;
    return (
      searched !== undefined &&
      searched.fromAltitude === target.fromAltitude &&
      searched.toAltitude === target.toAltitude &&
      searched.stepLegIndex === target.stepLegIndex &&
      searched.isOptimum === target.isOptimum
    );
  }

  private runSearch(
    planIndex: FlightPlanIndex,
    context: StepProfileContext,
    target: OptimumStepTarget,
    isNewSearch: boolean,
  ): void {
    const conditions = this.conditions();
    const optimum = conditions ? a380OptimumStep(context, target, conditions) : null;
    const plan = this.fmc.flightPlanInterface.get(planIndex);
    const waypointDistances = waypointDistancesAhead(
      this.fmc.guidanceController?.vnavDriver?.mcduProfile?.waypointPredictions,
      plan.activeLegIndex,
    );
    const anchor = optimum
      ? optimumStepAnchor(optimum.distance, waypointDistances, plan.allLegs, target.stepLegIndex)
      : null;
    this.lastSearch = {
      target,
      optimum: anchor ? optimum : null,
      anchor,
      isNewSearch,
      anchorIdent: legIdent(plan.allLegs, anchor?.legIndex ?? null),
      stepIdent: legIdent(plan.allLegs, target.stepLegIndex),
    };
  }

  /** The VNAV predictions are those of the active flight plan, whose legs the temporary flight plan keeps */
  private searchInputs(
    planIndex: FlightPlanIndex,
  ): { context: StepProfileContext; target: OptimumStepTarget | null } | null {
    const flightPlanInterface = this.fmc.flightPlanInterface;
    const profile = this.fmc.guidanceController?.vnavDriver?.mcduProfile;
    if (!flightPlanInterface.has(planIndex) || !profile) {
      return null;
    }
    const plan = flightPlanInterface.get(planIndex);
    const cruiseLevel = plan.performanceData.cruiseFlightLevel.get();
    const context = stepProfileContext(profile, plan.allLegs, plan.activeLegIndex);
    if (cruiseLevel === null || !context) {
      return null;
    }
    return { context, target: optimumStepTarget(context, cruiseLevel * 100, this.enteredAltitude) };
  }

  private conditions(): OptimumStepConditions | null {
    const performanceData = this.fmc.flightPlanInterface.active.performanceData;
    const costIndex = performanceData.costIndex.get();
    const zeroFuelWeight = performanceData.zeroFuelWeight.get();
    if (costIndex === null || zeroFuelWeight === null) {
      return null;
    }
    const tropopause = performanceData.tropopause.get() ?? ISA_TROPOPAUSE_ALTITUDE;
    // Design choice: the measured temperature and wind in cruise; before it, the CRZ TEMP entry and no wind
    const inCruise = this.fmc.fmgc.data.flightPhase.get() === FmgcFlightPhase.Cruise;
    const cruiseLevel = performanceData.cruiseFlightLevel.get() ?? 0;
    const cruiseTemperature = performanceData.cruiseTemperature.get();
    const isaDeviation = inCruise
      ? isaDeviationAt(
          this.fmc.fmgc.getPressureAlt() ?? SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet'),
          SimVar.GetSimVarValue('AMBIENT TEMPERATURE', 'celsius'),
          tropopause,
        )
      : cruiseTemperature !== null
        ? isaDeviationAt(cruiseLevel * 100, cruiseTemperature, tropopause)
        : 0;
    return {
      costIndex,
      zeroFuelWeight,
      isaDeviation,
      headwind: inCruise ? -SimVar.GetSimVarValue('AIRCRAFT WIND Z', 'knots') : 0,
      tropopause,
    };
  }
}

/** The ident of a leg of the flight plan, null for none or a discontinuity */
function legIdent(legs: readonly { isDiscontinuity: boolean; ident?: string }[], index: number | null): string | null {
  const leg = index !== null ? legs[index] : undefined;
  return leg && !leg.isDiscontinuity ? leg.ident ?? null : null;
}
