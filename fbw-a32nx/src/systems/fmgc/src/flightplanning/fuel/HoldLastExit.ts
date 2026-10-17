// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

/*
 * LAST EXIT time and fuel of the HOLD page (both aircraft).
 *
 * LAST EXIT is the time and the fuel on board at which the aircraft must leave the hold to land at the destination
 * with an EXTRA fuel of 0. Before the deceleration, the predictions do not include the hold (HM).
 *
 * So the EXTRA fuel of the predictions (the hold not flown) is what the aircraft can burn in the hold: it holds from
 * its arrival at the hold fix for as long as the EXTRA fuel lasts at the holding fuel flow, and leaves with the EXTRA fuel
 * burnt. Design choice: a negative EXTRA fuel means leaving at once (TIME TO EXIT), at the hold fix time and fuel.
 */

/** The time and fuel on board at the hold fix, or now when the aircraft is in the hold */
export interface HoldEntryPrediction {
  /** Time from now to the hold fix, s (0 in the hold) */
  secondsFromPresent: number;
  /** Fuel on board at the hold fix, in the unit of the caller */
  fuelOnBoard: number;
}

export interface HoldLastExit {
  /** Time from now to the last exit, s */
  secondsFromPresent: number;
  /** Fuel on board at the last exit, in the unit of the caller */
  fuelOnBoard: number;
}

/**
 * The time and fuel at which the aircraft arrives in the hold.
 * @param holdLegIndex the index of the hold leg in the flight plan
 * @param activeLegIndex the index of the active leg in the flight plan
 * @param fuelOnBoardNow the fuel on board now, null if unknown
 * @param holdFixPrediction the predictions at the hold fix (the leg before the hold leg), undefined if none
 * @returns the arrival in the hold, or null when the hold is behind the aircraft or a value is missing
 */
export function holdEntryPrediction(
  holdLegIndex: number,
  activeLegIndex: number,
  fuelOnBoardNow: number | null,
  holdFixPrediction: HoldEntryPrediction | undefined,
): HoldEntryPrediction | null {
  if (holdLegIndex < activeLegIndex) {
    return null;
  }
  if (holdLegIndex === activeLegIndex) {
    // in the hold: now, with the fuel on board now
    return fuelOnBoardNow !== null && Number.isFinite(fuelOnBoardNow)
      ? { secondsFromPresent: 0, fuelOnBoard: fuelOnBoardNow }
      : null;
  }
  if (
    !holdFixPrediction ||
    !Number.isFinite(holdFixPrediction.secondsFromPresent) ||
    !Number.isFinite(holdFixPrediction.fuelOnBoard)
  ) {
    return null;
  }
  return { secondsFromPresent: holdFixPrediction.secondsFromPresent, fuelOnBoard: holdFixPrediction.fuelOnBoard };
}

/**
 * The LAST EXIT of a hold: the EXTRA fuel is burnt in the hold, during the time it lasts at the holding fuel flow.
 * @param entry the arrival in the hold (holdEntryPrediction)
 * @param extraFuel the EXTRA fuel of the predictions, in the unit of entry.fuelOnBoard, null if unknown
 * @param extraFuelMinutes the time the EXTRA fuel lasts in the hold, minutes, null if unknown
 * @returns the last exit, or null without the data
 */
export function holdLastExit(
  entry: HoldEntryPrediction | null,
  extraFuel: number | null,
  extraFuelMinutes: number | null,
): HoldLastExit | null {
  if (
    entry === null ||
    extraFuel === null ||
    extraFuelMinutes === null ||
    !Number.isFinite(extraFuel) ||
    !Number.isFinite(extraFuelMinutes)
  ) {
    return null;
  }
  const heldFuel = Math.max(0, extraFuel);
  const heldMinutes = extraFuel > 0 ? Math.max(0, extraFuelMinutes) : 0;
  return {
    secondsFromPresent: entry.secondsFromPresent + heldMinutes * 60,
    fuelOnBoard: Math.max(0, entry.fuelOnBoard - heldFuel),
  };
}
