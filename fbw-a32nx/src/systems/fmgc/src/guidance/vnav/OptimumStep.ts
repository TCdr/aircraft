// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { AircraftConfig } from '@fmgc/flightplanning/AircraftConfigTypes';
import { CruiseStepEntry } from '@fmgc/flightplanning/CruiseStep';
import { Common } from './common';
import { EconAircraftParameters, EconFlightConditions, EconSpeeds, KG_PER_LB, tonnesToPounds } from './EconSpeeds';
import { NavGeometryProfile, VerticalCheckpointReason } from './profile/NavGeometryProfile';

/** Cost index unit kg/min expressed as pounds of fuel per hour */
const COST_INDEX_TO_POUNDS_PER_HOUR = 60 / KG_PER_LB;

/** The search starts this far beyond the T/C, or ahead of the aircraft in cruise, in NM */
const SEARCH_START_MARGIN = 20;

/** The search ends this far before the next step point, in NM */
const SEARCH_END_BEFORE_NEXT_STEP = 20;

/** The search ends this far before the T/D, in NM */
const SEARCH_END_BEFORE_TOP_OF_DESCENT = 300;

/** An optimum step is proposed only when it saves more than this fuel (in pounds) or this time (in seconds) */
const MIN_FUEL_SAVING = 100 / KG_PER_LB;
const MIN_TIME_SAVING = 60;

/** Design choice: the cruise is integrated, and the step searched, on a 10 NM grid */
const GRID_SPACING = 10;

/** Design choice: the level performance is computed once per 1000 lb of weight */
const WEIGHT_BUCKET = 1000;

export interface OptimumStepModel {
  config: AircraftConfig;
  aircraft: EconAircraftParameters;
  /** green dot speed in knots CAS at an altitude (feet) and a weight (pounds) */
  minSpeedAt(altitude: number, weight: number): number;
  /** the highest altitude the aircraft can step to at a weight (pounds), in feet, null when unknown */
  maxAltitudeAt(weight: number): number | null;
}

export interface OptimumStepInputs {
  /** in kg/min */
  costIndex: number;
  /** the cruise altitude before the step, in feet */
  fromAltitude: number;
  /** the step altitude, in feet */
  toAltitude: number;
  /** the gross weight at the start of the cruise at the step origin altitude, in pounds */
  cruiseStartWeight: number;
  /** in °C */
  isaDeviation: number;
  /** in knots, negative for a tailwind */
  headwind: number;
  /** in feet */
  tropopause: number;
  /** NM from the aircraft to the start of the cruise at the step origin altitude: the T/C, or 0 in cruise */
  cruiseStart: number;
  /** NM from the aircraft to the T/D */
  topOfDescent: number;
  /** NM from the aircraft to the next step after the optimised one, null without one */
  nextStepDistance: number | null;
  /** NM from the aircraft to the crew step being optimised, null to compare with a flight plan without the step */
  currentStepDistance: number | null;
}

export interface OptimumStep {
  /** NM from the aircraft to the optimum step point */
  distance: number;
  /** pounds, positive for a saving */
  fuelSaving: number;
  /** seconds, positive for a saving */
  timeSaving: number;
}

interface LevelPerformance {
  /** pounds per NM */
  fuelPerMile: number;
  /** hours per NM */
  hoursPerMile: number;
  mach: number;
}

interface PathCost {
  /** pounds */
  fuel: number;
  /** hours */
  time: number;
}

/**
 * The optimum step point: where a step climb from the cruise level to the step altitude gives the lowest trip cost
 * (fuel + cost index x time) over the cruise, between 20 NM beyond the T/C (or ahead of the aircraft) and 20 NM before
 * the next step or 300 NM before the T/D. Each level is flown at its ECON Mach for the cost index and the weight.
 *
 * Design choices: the climb is instantaneous along the path and costs the work of the weight over the height at the
 * cruise TSFC; the wind and the temperature deviation are the same at both levels; the weight along the path follows the
 * fuel burnt at the origin level until the step.
 * @returns the optimum step, or null when no step point saves more than 100 kg or 1 min against the comparison flight
 * plan (without the step, or with the crew step)
 */
export function computeOptimumStep(model: OptimumStepModel, inputs: OptimumStepInputs): OptimumStep | null {
  if (
    [
      inputs.costIndex,
      inputs.fromAltitude,
      inputs.toAltitude,
      inputs.cruiseStartWeight,
      inputs.isaDeviation,
      inputs.headwind,
      inputs.tropopause,
      inputs.cruiseStart,
      inputs.topOfDescent,
    ].some((value) => !Number.isFinite(value)) ||
    inputs.toAltitude <= inputs.fromAltitude ||
    inputs.cruiseStartWeight <= 0
  ) {
    return null;
  }

  const cruiseStart = Math.max(0, inputs.cruiseStart);
  const cruiseEnd = Math.min(inputs.topOfDescent, inputs.nextStepDistance ?? Infinity);
  const searchStart = cruiseStart + SEARCH_START_MARGIN;
  const searchEnd = Math.min(
    inputs.topOfDescent - SEARCH_END_BEFORE_TOP_OF_DESCENT,
    (inputs.nextStepDistance ?? Infinity) - SEARCH_END_BEFORE_NEXT_STEP,
  );
  if (searchEnd < searchStart || cruiseEnd <= cruiseStart) {
    return null;
  }

  const path = new CruisePath(model, inputs, cruiseStart, cruiseEnd);
  const costIndexPerHour = Math.max(0, inputs.costIndex) * COST_INDEX_TO_POUNDS_PER_HOUR;
  const tripCost = (cost: PathCost): number => cost.fuel + costIndexPerHour * cost.time;

  // A crew step that cannot be flown (above the max altitude) is compared as no step
  const reference =
    (inputs.currentStepDistance !== null ? path.withStepAt(path.nodeNearest(inputs.currentStepDistance)) : null) ??
    path.withoutStep();

  let best: { node: number; cost: PathCost } | null = null;
  for (let node = path.nodeNearest(searchStart); node < path.nodeCount && path.distanceOf(node) <= searchEnd; node++) {
    const cost = path.withStepAt(node);
    if (cost !== null && (best === null || tripCost(cost) < tripCost(best.cost))) {
      best = { node, cost };
    }
  }
  if (best === null) {
    return null;
  }

  const fuelSaving = reference.fuel - best.cost.fuel;
  const timeSaving = (reference.time - best.cost.time) * 3600;
  if (
    !Number.isFinite(fuelSaving) ||
    !(tripCost(reference) > tripCost(best.cost)) ||
    (fuelSaving <= MIN_FUEL_SAVING && timeSaving <= MIN_TIME_SAVING)
  ) {
    return null;
  }
  return { distance: path.distanceOf(best.node), fuelSaving, timeSaving };
}

/** The cruise between its start and its end on the grid, with the origin level flown from its start */
class CruisePath {
  private readonly nodeDistances: number[] = [];

  /** fuel and time from the cruise start to each node, and the weight there, at the origin level */
  private readonly originFuel: number[] = [];

  private readonly originTime: number[] = [];

  private readonly originWeight: number[] = [];

  private readonly performance = new Map<number, LevelPerformance | null>();

  constructor(
    private readonly model: OptimumStepModel,
    private readonly inputs: OptimumStepInputs,
    cruiseStart: number,
    cruiseEnd: number,
  ) {
    for (let distance = cruiseStart; distance < cruiseEnd; distance += GRID_SPACING) {
      this.nodeDistances.push(distance);
    }
    this.nodeDistances.push(cruiseEnd);

    let fuel = 0;
    let time = 0;
    let weight = inputs.cruiseStartWeight;
    for (let node = 0; node < this.nodeDistances.length; node++) {
      this.originFuel.push(fuel);
      this.originTime.push(time);
      this.originWeight.push(weight);
      if (node + 1 < this.nodeDistances.length) {
        const segment = this.flySegment(
          inputs.fromAltitude,
          weight,
          this.nodeDistances[node + 1] - this.nodeDistances[node],
        );
        fuel += segment?.fuel ?? Infinity;
        time += segment?.time ?? Infinity;
        weight -= segment?.fuel ?? 0;
      }
    }
  }

  get nodeCount(): number {
    return this.nodeDistances.length;
  }

  distanceOf(node: number): number {
    return this.nodeDistances[node];
  }

  nodeNearest(distance: number): number {
    let nearest = 0;
    for (let node = 1; node < this.nodeDistances.length; node++) {
      if (Math.abs(this.nodeDistances[node] - distance) < Math.abs(this.nodeDistances[nearest] - distance)) {
        nearest = node;
      }
    }
    return nearest;
  }

  withoutStep(): PathCost {
    const last = this.nodeDistances.length - 1;
    return { fuel: this.originFuel[last], time: this.originTime[last] };
  }

  /** The cost of the cruise with the step at a node, null when the step altitude cannot be flown there */
  withStepAt(node: number): PathCost | null {
    const stepWeight = this.originWeight[node];
    const maxAltitude = this.model.maxAltitudeAt(stepWeight);
    if (maxAltitude !== null && this.inputs.toAltitude > maxAltitude) {
      return null;
    }
    const origin = this.levelPerformance(this.inputs.fromAltitude, stepWeight);
    if (origin === null) {
      return null;
    }
    const climbFuel = EconSpeeds.climbFuel(
      this.model.aircraft,
      origin.mach,
      this.conditions(this.inputs.fromAltitude, stepWeight),
      this.inputs.toAltitude - this.inputs.fromAltitude,
    );

    let fuel = this.originFuel[node] + climbFuel;
    let time = this.originTime[node];
    let weight = stepWeight - climbFuel;
    for (let next = node + 1; next < this.nodeDistances.length; next++) {
      const segment = this.flySegment(
        this.inputs.toAltitude,
        weight,
        this.nodeDistances[next] - this.nodeDistances[next - 1],
      );
      if (segment === null) {
        return null;
      }
      fuel += segment.fuel;
      time += segment.time;
      weight -= segment.fuel;
    }
    return { fuel, time };
  }

  private flySegment(altitude: number, weight: number, distance: number): PathCost | null {
    const performance = this.levelPerformance(altitude, weight);
    return performance ? { fuel: performance.fuelPerMile * distance, time: performance.hoursPerMile * distance } : null;
  }

  private levelPerformance(altitude: number, weight: number): LevelPerformance | null {
    const bucket = Math.round(weight / WEIGHT_BUCKET);
    const key = bucket * 2 + (altitude === this.inputs.toAltitude ? 1 : 0);
    if (!this.performance.has(key)) {
      this.performance.set(key, this.computeLevelPerformance(altitude, bucket * WEIGHT_BUCKET));
    }
    return this.performance.get(key) ?? null;
  }

  private computeLevelPerformance(altitude: number, weight: number): LevelPerformance | null {
    const conditions = this.conditions(altitude, weight);
    const mach = EconSpeeds.econCruiseMach(
      this.model.config,
      this.model.aircraft,
      Math.max(0, this.inputs.costIndex),
      conditions,
      this.model.minSpeedAt(altitude, weight),
    );
    if (mach === null) {
      return null;
    }
    const theta = Common.getTheta(altitude, this.inputs.isaDeviation, altitude > this.inputs.tropopause);
    const groundSpeed = Common.machToTAS(mach, theta) - this.inputs.headwind;
    if (groundSpeed <= 0) {
      return null;
    }
    return {
      fuelPerMile: EconSpeeds.costPerGroundMile(this.model.config, this.model.aircraft, 0, mach, conditions),
      hoursPerMile: 1 / groundSpeed,
      mach,
    };
  }

  private conditions(altitude: number, weight: number): EconFlightConditions {
    return {
      altitude,
      weight,
      isaDeviation: this.inputs.isaDeviation,
      headwind: this.inputs.headwind,
      tropopause: this.inputs.tropopause,
    };
  }
}

/** A step of the flight plan ahead of the aircraft */
export interface CruiseStepPoint {
  legIndex: number;
  /** NM from the aircraft to the step point */
  distance: number;
  /** feet */
  toAltitude: number;
  isOptimum: boolean;
}

/** What the optimum step search takes from the VNAV profile of the active flight plan */
export interface StepProfileContext {
  /** NM from the aircraft to the start of the cruise: the T/C, or 0 in cruise */
  cruiseStart: number;
  /** NM from the aircraft to the T/D */
  topOfDescent: number;
  /** fuel on board at the start of the cruise, in pounds */
  cruiseStartFuel: number;
  /** the steps ahead, in flight plan order */
  steps: CruiseStepPoint[];
}

/** A flight plan element as the step search reads it */
interface StepLeg {
  isDiscontinuity: boolean;
  cruiseStep?: CruiseStepEntry;
}

/**
 * The cruise of the VNAV profile and the steps ahead
 * @param profile the VNAV profile of the active flight plan
 * @param legs the elements of the active flight plan
 * @param activeLegIndex the index of the active leg
 * @returns the context, or null before the profile has a T/D
 */
export function stepProfileContext(
  profile: NavGeometryProfile,
  legs: readonly StepLeg[],
  activeLegIndex: number,
): StepProfileContext | null {
  if (!profile.isReadyToDisplay) {
    return null;
  }
  const fromAircraft = (distanceFromStart: number) => distanceFromStart - profile.distanceToPresentPosition;
  const topOfDescent = profile.findVerticalCheckpoint(VerticalCheckpointReason.TopOfDescent);
  const topOfClimb = profile.findVerticalCheckpoint(VerticalCheckpointReason.TopOfClimb);
  const presentPosition = profile.findVerticalCheckpoint(VerticalCheckpointReason.PresentPosition);
  if (!topOfDescent) {
    return null;
  }
  const climbAhead = topOfClimb !== undefined && fromAircraft(topOfClimb.distanceFromStart) > 0;
  const cruiseStartFuel = climbAhead ? topOfClimb.remainingFuelOnBoard : presentPosition?.remainingFuelOnBoard;
  if (cruiseStartFuel === undefined) {
    return null;
  }

  const steps: CruiseStepPoint[] = [];
  for (let legIndex = activeLegIndex; legIndex < legs.length; legIndex++) {
    const leg = legs[legIndex];
    const prediction = profile.waypointPredictions.get(legIndex);
    if (leg.isDiscontinuity || !leg.cruiseStep || leg.cruiseStep.isIgnored || !prediction) {
      continue;
    }
    steps.push({
      legIndex,
      distance: prediction.distanceFromAircraft - leg.cruiseStep.distanceBeforeTermination,
      toAltitude: leg.cruiseStep.toAltitude,
      isOptimum: leg.cruiseStep.isOptimum === true,
    });
  }

  return {
    cruiseStart: climbAhead ? fromAircraft(topOfClimb.distanceFromStart) : 0,
    topOfDescent: fromAircraft(topOfDescent.distanceFromStart),
    cruiseStartFuel,
    steps,
  };
}

/** The step whose optimum point is searched */
export interface OptimumStepTarget {
  fromAltitude: number;
  toAltitude: number;
  /** NM from the aircraft to the step of the flight plan, null when the step altitude was only entered */
  currentStepDistance: number | null;
  nextStepDistance: number | null;
  /** the leg of the step of the flight plan, null when the step altitude was only entered */
  stepLegIndex: number | null;
  /** the step of the flight plan is an inserted optimum step */
  isOptimum: boolean;
}

/**
 * The step to optimise: the first step ahead when it is a step climb, or without a step in the flight plan, the step
 * altitude entered for the optimum step search.
 * @param cruiseAltitude the cruise level, in feet
 * @param enteredAltitude the step altitude entered without a waypoint, in feet, null without one
 */
export function optimumStepTarget(
  context: StepProfileContext,
  cruiseAltitude: number,
  enteredAltitude: number | null,
): OptimumStepTarget | null {
  if (context.steps.length > 0) {
    const [first, next] = context.steps;
    return first.toAltitude > cruiseAltitude
      ? {
          fromAltitude: cruiseAltitude,
          toAltitude: first.toAltitude,
          currentStepDistance: first.distance,
          nextStepDistance: next?.distance ?? null,
          stepLegIndex: first.legIndex,
          isOptimum: first.isOptimum,
        }
      : null;
  }
  return enteredAltitude !== null && enteredAltitude > cruiseAltitude
    ? {
        fromAltitude: cruiseAltitude,
        toAltitude: enteredAltitude,
        currentStepDistance: null,
        nextStepDistance: null,
        stepLegIndex: null,
        isOptimum: false,
      }
    : null;
}

/** The performance entries and the weather of the optimum step search */
export interface OptimumStepConditions {
  /** kg/min */
  costIndex: number;
  /** tonnes */
  zeroFuelWeight: number;
  /** °C */
  isaDeviation: number;
  /** knots, negative for a tailwind */
  headwind: number;
  /** feet */
  tropopause: number;
}

/** The search inputs of a step to optimise in the cruise of the VNAV profile */
export function optimumStepInputs(
  context: StepProfileContext,
  target: OptimumStepTarget,
  conditions: OptimumStepConditions,
): OptimumStepInputs {
  return {
    costIndex: conditions.costIndex,
    fromAltitude: target.fromAltitude,
    toAltitude: target.toAltitude,
    cruiseStartWeight: tonnesToPounds(conditions.zeroFuelWeight) + context.cruiseStartFuel,
    isaDeviation: conditions.isaDeviation,
    headwind: conditions.headwind,
    tropopause: conditions.tropopause,
    cruiseStart: context.cruiseStart,
    topOfDescent: context.topOfDescent,
    nextStepDistance: target.nextStepDistance,
    currentStepDistance: target.currentStepDistance,
  };
}

/**
 * NM from the aircraft to the waypoints from the active leg on, by leg index
 * @param predictions the VNAV waypoint predictions, undefined without a profile
 */
export function waypointDistancesAhead(
  predictions: ReadonlyMap<number, { distanceFromAircraft: number }> | undefined,
  activeLegIndex: number,
): Map<number, number> {
  const waypointDistances = new Map<number, number>();
  predictions?.forEach((prediction, legIndex) => {
    if (legIndex >= activeLegIndex) {
      waypointDistances.set(legIndex, prediction.distanceFromAircraft);
    }
  });
  return waypointDistances;
}

/** Where the optimum step goes in the flight plan: on a waypoint, a distance before it */
export interface OptimumStepAnchor {
  legIndex: number;
  /** NM */
  distanceBeforeTermination: number;
}

/**
 * The flight plan steps are stored on waypoints: the optimum step point goes on the first waypoint at or after it,
 * the distance between them before that waypoint.
 * @param distance NM from the aircraft to the optimum step point
 * @param waypointDistances NM from the aircraft to the waypoints ahead, by leg index
 * @param movedStepLegIndex the leg of the step that the optimum step replaces, null without one
 * @returns the anchor, or null when no waypoint without another step follows the point
 */
export function optimumStepAnchor(
  distance: number,
  waypointDistances: ReadonlyMap<number, number>,
  legs: readonly StepLeg[],
  movedStepLegIndex: number | null,
): OptimumStepAnchor | null {
  let anchor: OptimumStepAnchor | null = null;
  for (const [legIndex, waypointDistance] of waypointDistances) {
    if (waypointDistance < distance || (anchor !== null && legIndex > anchor.legIndex)) {
      continue;
    }
    const leg = legs[legIndex];
    if (!leg || leg.isDiscontinuity || (leg.cruiseStep && legIndex !== movedStepLegIndex)) {
      continue;
    }
    anchor = { legIndex, distanceBeforeTermination: waypointDistance - distance };
  }
  return anchor;
}

/**
 * The predicted time at a step point a distance before its waypoint, in seconds from the present
 * @param profile the VNAV profile of the active flight plan
 * @param waypointDistanceFromStart the distance from the start of the profile to the waypoint, in NM
 * @param distanceBeforeTermination the step point is this far before the waypoint, in NM
 */
export function stepPointSecondsFromPresent(
  profile: NavGeometryProfile,
  waypointDistanceFromStart: number,
  distanceBeforeTermination: number,
): number {
  return profile.interpolateTimeAtDistance(waypointDistanceFromStart - distanceBeforeTermination);
}
