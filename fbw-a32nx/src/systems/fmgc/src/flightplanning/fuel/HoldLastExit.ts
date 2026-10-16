// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

/*
 * LAST EXIT time and fuel of the HOLD page (both aircraft).
 *
 * A320 FCOM HOLD page (a320_fcom.txt l.18272-18275): "LAST EXIT UTC FUEL This field displays the time at which the
 * aircraft must leave the holding pattern in order to meet fuel policy criteria (extra fuel = 0). The system also
 * displays the estimated fuel on board at that time".
 * A380 FCOM HOLD page (a380_fcom.txt l.36440-36444): "LAST EXIT TIME AND FUEL Indicates the estimated UTC time (or flight
 * time), and amount of fuel remaining, at which the aircraft must exit the holding pattern, so as to comply with the fuel
 * policy. The fuel policy considers an extra fuel = 0 at landing at the primary destination."
 * A380 FCOM DSC-22-FMS-10-40-50 HM (l.25429-25430, l.25458-25460): before the deceleration "the FMS does not take it [the
 * hold] into account for predictions", and "The FMS also predicts the estimated time and amount of fuel remaining at which
 * the aircraft must exit the holding pattern".
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

/** The LAST EXIT of a hold */
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
  holdFixPrediction: { secondsFromPresent: number; fuelOnBoard: number } | undefined,
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
