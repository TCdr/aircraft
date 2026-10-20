// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { KG_PER_LB, tonnesToPounds } from '@fmgc/guidance/vnav/EconSpeeds';

export interface VnavTrip {
  /** tonnes */
  tripFuel: number;
  /** minutes */
  tripTime: number;
}

/**
 * The trip fuel and time of the active flight plan from the VNAV predictions: the fuel the profile burns from its start
 * (the present position, or the takeoff before it) to the destination, and the time to the destination. The VNAV
 * profile starts from the FOB, which still holds the taxi fuel before takeoff, so the trip does not include it.
 * @param profileStartFuel the fuel on board at the start of the VNAV profile, in pounds, undefined without a profile
 * @param destinationFuel the predicted fuel on board at the destination, in pounds, undefined without a prediction
 * @param secondsToDestination the predicted time from the present (or the takeoff) to the destination, in seconds
 * @returns the trip, or null when the VNAV has no destination prediction (the fuel table is used then)
 */
export function vnavTripPrediction(
  profileStartFuel: number | undefined,
  destinationFuel: number | undefined,
  secondsToDestination: number | undefined,
): VnavTrip | null {
  if (
    profileStartFuel === undefined ||
    destinationFuel === undefined ||
    secondsToDestination === undefined ||
    !Number.isFinite(profileStartFuel) ||
    !Number.isFinite(destinationFuel) ||
    !Number.isFinite(secondsToDestination) ||
    secondsToDestination <= 0
  ) {
    return null;
  }
  return {
    tripFuel: (Math.max(0, profileStartFuel - destinationFuel) * KG_PER_LB) / 1000,
    tripTime: secondsToDestination / 60,
  };
}

/**
 * The destination EFOB of the VNAV predictions as the FUEL PRED page shows it: before takeoff the predictions start
 * from the FOB, which still holds the taxi fuel, so it is deducted.
 * @param destinationFuel the predicted fuel on board at the destination, in pounds, null without a prediction
 * @param taxiFuel the taxi fuel, in tonnes, null without one
 * @param isFlying the aircraft is flying (the taxi fuel is burnt)
 * @returns pounds, null without a prediction
 */
export function destinationFuelAfterTaxi(
  destinationFuel: number | null,
  taxiFuel: number | null,
  isFlying: boolean,
): number | null {
  if (destinationFuel === null || isFlying || taxiFuel === null) {
    return destinationFuel;
  }
  return destinationFuel - tonnesToPounds(taxiFuel);
}
