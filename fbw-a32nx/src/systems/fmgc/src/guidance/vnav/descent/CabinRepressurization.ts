// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { CabinPressurizationModel } from '@fmgc/flightplanning/AircraftConfigTypes';
import { Common } from '@fmgc/guidance/vnav/common';
import { FmgcFlightPhase } from '@shared/flightphase';

/** The maximum descent cabin rate while the flight crew has entered none */
const DEFAULT_MAX_DESCENT_CABIN_RATE: FeetPerMinute = -350;

/** The limits of a DES CABIN RATE entry, ft/min without the sign */
const DESCENT_CABIN_RATE_ENTRY_MIN = 100;
const DESCENT_CABIN_RATE_ENTRY_MAX = 999;

/** CABIN RATE EXCEEDED is checked within this distance of the destination */
const CABIN_RATE_EXCEEDED_DISTANCE_TO_DESTINATION: NauticalMiles = 200;

/**
 * Design choice: the computed cabin rate must be this much steeper than the maximum before the FMS calls it exceeded,
 * so that the rounding of the repressurization segment (a few seconds) does not raise the message.
 */
const CABIN_RATE_TOLERANCE: FeetPerMinute = 10;

const SEA_LEVEL_PRESSURE_PSI = 14.6959;

const ISA_TROPOPAUSE: Feet = 36089.24;

/**
 * @param pilotEntry the DES CABIN RATE entered by the flight crew (ft/min, negative), null without an entry
 * @returns the maximum descent cabin rate the descent profile keeps to, ft/min (negative)
 */
export function maxDescentCabinRate(pilotEntry: FeetPerMinute | null | undefined): FeetPerMinute {
  return isPilotEntry(pilotEntry) ? -Math.abs(pilotEntry) : DEFAULT_MAX_DESCENT_CABIN_RATE;
}

function isPilotEntry(pilotEntry: FeetPerMinute | null | undefined): pilotEntry is FeetPerMinute {
  return typeof pilotEntry === 'number' && Number.isFinite(pilotEntry) && pilotEntry !== 0;
}

/**
 * The cabin altitude at the end of the cruise: the cabin is at the maximum differential pressure, limited to the
 * maximum cabin altitude, and never below the landing field elevation.
 * Design choice: the maximum differential pressure stands for the pressure schedule at every cruise level (at low
 * levels the real cabin climbs a little higher, so the repressurization is a little underestimated there).
 * @param cruiseAltitude the cruise pressure altitude, ft
 * @param destinationElevation the landing field elevation, ft
 * @param model the cabin pressure model of the aircraft
 * @returns the cabin pressure altitude in cruise, ft
 */
export function cruiseCabinAltitude(
  cruiseAltitude: Feet,
  destinationElevation: Feet,
  model: CabinPressurizationModel,
): Feet {
  const ambientPressure = SEA_LEVEL_PRESSURE_PSI * Common.getDelta(cruiseAltitude, cruiseAltitude > ISA_TROPOPAUSE);
  const cabinPressureRatio = (ambientPressure + model.maxDeltaPressure) / SEA_LEVEL_PRESSURE_PSI;
  const levelOffCabinAltitude = troposphereAltitudeFromPressureRatio(cabinPressureRatio);

  return Math.max(Math.min(levelOffCabinAltitude, model.maxCabinAltitude), destinationElevation);
}

/** The inverse of {@link Common.getDelta} below the tropopause (a cabin is always below it) */
function troposphereAltitudeFromPressureRatio(delta: number): Feet {
  return ((1 - delta ** (1 / 5.25588)) * 288.15) / 0.0019812;
}

/**
 * @param cabinDescent the cabin altitude to lose, ft
 * @param maxRate the maximum descent cabin rate, ft/min (negative)
 * @returns the shortest descent that keeps the cabin within the maximum rate, s
 */
export function requiredDescentSeconds(cabinDescent: Feet, maxRate: FeetPerMinute): Seconds {
  if (cabinDescent <= 0) {
    return 0;
  }
  return (cabinDescent / Math.abs(maxRate)) * 60;
}

/**
 * @param cabinDescent the cabin altitude to lose, ft
 * @param descentSeconds the time from the top of descent (or the present position) to the landing, s
 * @returns the mean descent cabin rate, ft/min (negative)
 */
export function meanCabinDescentRate(cabinDescent: Feet, descentSeconds: Seconds): FeetPerMinute {
  if (cabinDescent <= 0) {
    return 0;
  }
  if (descentSeconds <= 0) {
    return -Infinity;
  }
  return -cabinDescent / (descentSeconds / 60);
}

export interface DisplayedDescentCabinRate {
  /** ft/min, negative */
  rate: FeetPerMinute;
  /** The FMS-computed rate, steeper than the maximum: the profile cannot meet the maximum */
  isComputed: boolean;
}

/**
 * The DES CABIN RATE field shows the steeper of the computed cabin rate of the descent profile and the maximum rate.
 * @param meanRate the mean descent cabin rate of the descent profile, ft/min (negative)
 * @param maxRate the maximum descent cabin rate, ft/min (negative)
 */
export function displayedDescentCabinRate(meanRate: FeetPerMinute, maxRate: FeetPerMinute): DisplayedDescentCabinRate {
  const isComputed = Number.isFinite(meanRate) && meanRate < maxRate - CABIN_RATE_TOLERANCE;
  return { rate: Math.round(isComputed ? meanRate : maxRate), isComputed };
}

/**
 * The time left to the landing on the theoretical descent profile. Past the top of descent (still in cruise) the
 * aircraft has to fly the same descent over a shorter distance.
 * Design choice: at the same speeds, so the time shrinks with the distance.
 * @param descentSeconds the time from the top of descent to the landing, s
 * @param descentDistance the distance from the top of descent to the landing, NM
 * @param distanceToTopOfDescent the distance to the top of descent, NM, negative once passed
 * @returns s
 */
export function remainingDescentSeconds(
  descentSeconds: Seconds,
  descentDistance: NauticalMiles,
  distanceToTopOfDescent: NauticalMiles,
): Seconds {
  if (distanceToTopOfDescent >= 0 || descentDistance <= 0) {
    return descentSeconds;
  }
  const remainingDistance = Math.max(0, descentDistance + distanceToTopOfDescent);
  return (descentSeconds * remainingDistance) / descentDistance;
}

export interface DescentCabinRateField {
  /** ft/min, negative */
  rate: FeetPerMinute;
  /** The flight crew entry in force: large font. The default or a computed rate: small font. */
  isPilotEntered: boolean;
}

/**
 * The DES CABIN RATE field of the MCDU / MFD
 * @param pilotEntry the DES CABIN RATE entered by the flight crew, null without an entry
 * @param display the rate of the descent profile, null before the FMS has computed one
 */
export function descentCabinRateField(
  pilotEntry: FeetPerMinute | null | undefined,
  display: DisplayedDescentCabinRate | null,
): DescentCabinRateField {
  const isEntered = isPilotEntry(pilotEntry);
  if (display) {
    return { rate: display.rate, isPilotEntered: isEntered && !display.isComputed };
  }
  return { rate: maxDescentCabinRate(pilotEntry), isPilotEntered: isEntered };
}

export interface CabinRateExceededInputs {
  flightPhase: FmgcFlightPhase;
  /** The flight phases of the aircraft in which the message is checked */
  checkedPhases: readonly FmgcFlightPhase[];
  distanceToDestination: NauticalMiles;
  /** The cabin altitude to lose, ft */
  cabinDescent: Feet;
  /** The time left to the landing on the theoretical descent profile, s */
  remainingDescentSeconds: Seconds;
  /** ft/min, negative */
  maxRate: FeetPerMinute;
}

/**
 * CABIN RATE EXCEEDED: close to the destination, the theoretical descent profile is too short for the cabin to be
 * repressurized at the maximum cabin rate.
 */
export function isCabinRateExceeded(inputs: CabinRateExceededInputs): boolean {
  if (
    !inputs.checkedPhases.includes(inputs.flightPhase) ||
    !Number.isFinite(inputs.distanceToDestination) ||
    inputs.distanceToDestination > CABIN_RATE_EXCEEDED_DISTANCE_TO_DESTINATION
  ) {
    return false;
  }
  const rate = meanCabinDescentRate(inputs.cabinDescent, inputs.remainingDescentSeconds);
  return rate < inputs.maxRate - CABIN_RATE_TOLERANCE;
}

export type DescentCabinRateEntry = { rate: FeetPerMinute } | { error: 'format' | 'range' };

/**
 * A DES CABIN RATE entry: NNN or -NNN (the rate is a descent, the minus sign is not needed), 100 to 999 ft/min.
 * @param text the scratchpad text
 */
export function parseDescentCabinRateEntry(text: string): DescentCabinRateEntry {
  const match = /^-?(\d{1,3})$/.exec(text);
  if (!match) {
    return { error: 'format' };
  }
  const value = parseInt(match[1], 10);
  if (value < DESCENT_CABIN_RATE_ENTRY_MIN || value > DESCENT_CABIN_RATE_ENTRY_MAX) {
    return { error: 'range' };
  }
  return { rate: -value };
}
