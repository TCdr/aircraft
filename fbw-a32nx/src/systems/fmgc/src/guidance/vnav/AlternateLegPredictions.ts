// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { TailwindComponent, WindVector } from '@fmgc/flightplanning/data/wind';
import {
  AlternateFuelPrediction,
  alternateProfileAt,
  alternateProfileSpeed,
} from '@fmgc/guidance/vnav/AlternateFuelPredictor';
import { BaseFlightPlan } from '@fmgc/flightplanning/plans/BaseFlightPlan';
import { ProfilePhase, VerticalWaypointPrediction } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';

export interface AlternateLegDistance {
  /** The index of the leg in the alternate flight plan */
  legIndex: number;
  /** NM from the primary destination along the alternate flight plan */
  distance: number;
}

/** The predictions of the primary flight plan at its destination: where the alternate flight plan starts */
export interface AlternateStart {
  secondsFromPresent: number;
  /** Pounds */
  estimatedFuelOnBoard: number;
  distanceFromStart: number;
}

/** The ALTN fuel and time the pages show (computed or entered), to which the profile is scaled; null keeps the model */
export interface AlternateTotals {
  /** Pounds */
  fuel: number | null;
  /** Seconds */
  time: number | null;
}

/**
 * The start of the alternate flight plan before the primary flight plan has predictions (no ZFW or fuel entered yet):
 * the altitudes and speeds are still shown, the times and EFOB stay dashes.
 */
export const UNKNOWN_ALTERNATE_START: AlternateStart = {
  secondsFromPresent: NaN,
  estimatedFuelOnBoard: NaN,
  distanceFromStart: 0,
};

const PHASE_OF_PROFILE = {
  climb: ProfilePhase.Climb,
  cruise: ProfilePhase.Cruise,
  descent: ProfilePhase.Descent,
};

/**
 * The predictions at the legs of the alternate flight plan: the profile of the alternate prediction, from the primary
 * destination to the landing at the alternate. Design choice: the profile is scaled so that its total fuel and time are
 * the ALTN fuel and time of the FUEL pages (the FCOM tables for the A320, an entered ALTN fuel): the EFOB at the
 * alternate then agrees with the EFOB the FUEL pages give.
 * @param prediction the alternate prediction (profile and speeds)
 * @param legs the legs of the alternate flight plan with their distance from the primary destination
 * @param start the predictions of the primary flight plan at its destination
 * @param totals the ALTN fuel and time the profile is scaled to
 * @param tropopause feet
 * @param windPrediction the constant wind of the alternate flight plan
 * @returns the predictions by leg index of the alternate flight plan
 */
export function alternateLegPredictions(
  prediction: AlternateFuelPrediction,
  legs: AlternateLegDistance[],
  start: AlternateStart,
  totals: AlternateTotals,
  tropopause: number,
  windPrediction: WindVector | TailwindComponent,
): Map<number, VerticalWaypointPrediction> {
  const fuelScale = totals.fuel !== null && prediction.fuel > 0 ? totals.fuel / prediction.fuel : 1;
  const timeScale = totals.time !== null && prediction.time > 0 ? totals.time / prediction.time : 1;
  const predictions = new Map<number, VerticalWaypointPrediction>();
  for (const leg of legs) {
    const point = alternateProfileAt(prediction.profile, leg.distance);
    predictions.set(leg.legIndex, {
      distanceFromStart: start.distanceFromStart + point.distance,
      secondsFromPresent: start.secondsFromPresent + point.time * timeScale,
      altitude: point.altitude,
      speed: alternateProfileSpeed(point, prediction.speeds, tropopause),
      // The alternate flight plan predictions give no constraints
      altitudeConstraint: undefined as unknown as VerticalWaypointPrediction['altitudeConstraint'],
      speedConstraint: undefined as unknown as VerticalWaypointPrediction['speedConstraint'],
      isAltitudeConstraintMet: true,
      isSpeedConstraintMet: true,
      altError: 0,
      estimatedFuelOnBoard: start.estimatedFuelOnBoard - point.fuel * fuelScale,
      distanceFromAircraft: start.distanceFromStart + point.distance,
      profilePhase: PHASE_OF_PROFILE[point.phase],
      windPrediction,
    });
  }
  return predictions;
}

/**
 * @param directDistance NM between the primary destination and the alternate
 * @param routeDistance NM along the alternate flight plan legs, null before they are computed
 * @returns the distance of the alternate flight plan for the predictions: along its legs, the direct distance without
 * an alternate route
 */
export function alternatePlanDistance(directDistance: number, routeDistance: number | null): number {
  // A route distance out of proportion with the direct distance is not the alternate route (geometry not computed)
  return routeDistance !== null && routeDistance <= 3 * directDistance + 20 ? routeDistance : directDistance;
}

/**
 * @param alternatePlan the alternate flight plan
 * @returns the computed legs of the alternate flight plan (without its missed approach) with their distance from the
 * primary destination, along the legs
 */
export function alternateLegDistances(alternatePlan: BaseFlightPlan): AlternateLegDistance[] {
  const legs: AlternateLegDistance[] = [];
  for (let i = 0; i < alternatePlan.firstMissedApproachLegIndex; i++) {
    const element = alternatePlan.maybeElementAt(i);
    const distance =
      element?.isDiscontinuity === false ? element.calculated?.cumulativeDistanceWithTransitions : undefined;
    if (distance !== undefined && Number.isFinite(distance)) {
      legs.push({ legIndex: i, distance });
    }
  }
  return legs;
}

/**
 * @param alternatePlan the alternate flight plan
 * @returns the distance from the primary destination to the landing at the alternate along its computed legs, null
 * before they are computed
 */
export function alternateRouteDistance(alternatePlan: BaseFlightPlan): number | null {
  const legs = alternateLegDistances(alternatePlan).filter((leg) => leg.distance > 0);
  return legs.length > 0 ? legs[legs.length - 1].distance : null;
}
