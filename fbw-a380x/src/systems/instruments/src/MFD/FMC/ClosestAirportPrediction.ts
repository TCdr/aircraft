// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AircraftConfig } from '@fmgc/flightplanning/AircraftConfigTypes';
import { Common } from '@fmgc/guidance/vnav/common';
import { EngineModel } from '@fmgc/guidance/vnav/EngineModel';
import { Predictions } from '@fmgc/guidance/vnav/Predictions';

/*
 * Time and fuel to an airport of the CLOSEST AIRPORTS page.
 *
 * The predictions use the great circle distance to the airport, the effective winds (default or entered), the current
 * delta ISA, and a flight from the present position to the ground: a cruise at the CRZ FL at an optimum cruise Mach
 * (CRZ FL, GW and CI) in managed speed, then a continuous descent from the CRZ FL to the airport elevation.
 *
 * How the descent is computed is not specified. Design choices:
 * - the descent is an idle descent at the managed descent speed (CAS / Mach), limited to 250 kt below 10 000 ft, in
 *   steps of 2 000 ft with the VNAV engine and flight models (the idle N1 of the VNAV descent, with its margin), without
 *   a deceleration or an approach;
 * - the cruise distance is the great circle distance minus the descent distance, flown first, level at the CRZ FL; the
 *   descent is then computed again with the fuel left after the cruise;
 * - an airport closer than the descent distance gets that share of the descent time and fuel (the aircraft cannot fly
 *   the whole descent on the way).
 */

/** Below this altitude the descent speed is limited to the speed limit (design choice, 250 kt below 10 000 ft) */
const SPEED_LIMIT_ALTITUDE = 10_000;

const SPEED_LIMIT = 250;

/** Altitude step of the descent computation, ft */
const DESCENT_STEP = 2_000;

export interface ClosestAirportPredictionInput {
  /** The CRZ FL as an altitude, ft */
  cruiseAltitude: number;
  /** The airport elevation, ft */
  airportElevation: number;
  /** The great circle distance to the airport, NM */
  distance: number;
  cruiseCas: number;
  cruiseMach: number;
  descentCas: number;
  descentMach: number;
  /** ZFW, lb */
  zeroFuelWeight: number;
  /** Fuel on board now, lb */
  fuelOnBoard: number;
  /** Head wind component, kt (tail wind negative) */
  headwind: number;
  /** ISA deviation, °C */
  isaDeviation: number;
  /** Tropopause altitude, ft */
  tropopause: number;
}

export interface ClosestAirportPredictionResult {
  /** Time to the airport, s */
  seconds: number;
  /** Fuel burnt to the airport, lb */
  fuelBurned: number;
  /** Distance flown level at the CRZ FL, NM */
  cruiseDistance: number;
  /** Distance of the descent from the CRZ FL to the airport elevation, NM */
  descentDistance: number;
}

interface SegmentResult {
  distance: number;
  seconds: number;
  fuelBurned: number;
}

/**
 * The idle descent from the CRZ FL to the airport elevation.
 * @param config the aircraft configuration
 * @param input the prediction input
 * @param fuelOnBoard the fuel on board at the start of the descent, lb
 */
export function idleDescentToAirport(
  config: AircraftConfig,
  input: ClosestAirportPredictionInput,
  fuelOnBoard: number,
): SegmentResult {
  const result: SegmentResult = { distance: 0, seconds: 0, fuelBurned: 0 };
  let altitude = input.cruiseAltitude;
  while (altitude > input.airportElevation + 1) {
    const step = Math.min(DESCENT_STEP, altitude - input.airportElevation);
    const midAltitude = altitude - step / 2;
    const cas = midAltitude < SPEED_LIMIT_ALTITUDE ? Math.min(input.descentCas, SPEED_LIMIT) : input.descentCas;
    const aboveTropopause = midAltitude > input.tropopause;
    const mach = Math.min(Common.CAStoMach(cas, Common.getDelta(midAltitude, aboveTropopause)), input.descentMach);
    const idleN1 =
      EngineModel.getIdleCorrectedN1(config.engineModelParameters, midAltitude, mach, input.tropopause) +
      config.vnavConfig.IDLE_N1_MARGIN;

    const stepResult = Predictions.altitudeStep(
      config,
      altitude,
      -step,
      cas,
      input.descentMach,
      idleN1,
      input.zeroFuelWeight,
      fuelOnBoard - result.fuelBurned,
      input.headwind,
      input.isaDeviation,
      input.tropopause,
    );
    result.distance += stepResult.distanceTraveled;
    result.seconds += stepResult.timeElapsed;
    result.fuelBurned += stepResult.fuelBurned;
    altitude -= step;
  }
  return result;
}

/**
 * The time and fuel to an airport: cruise at the CRZ FL, then an idle descent to the airport elevation.
 * @param config the aircraft configuration
 * @param input the prediction input
 */
export function closestAirportPrediction(
  config: AircraftConfig,
  input: ClosestAirportPredictionInput,
): ClosestAirportPredictionResult {
  // the descent distance with the fuel on board now, to know the cruise distance
  const firstDescent = idleDescentToAirport(config, input, input.fuelOnBoard);
  const cruiseDistance = Math.max(0, input.distance - firstDescent.distance);

  const cruise: SegmentResult = { distance: 0, seconds: 0, fuelBurned: 0 };
  if (cruiseDistance > 0) {
    const step = Predictions.levelFlightStep(
      config,
      input.cruiseAltitude,
      cruiseDistance,
      input.cruiseCas,
      input.cruiseMach,
      input.zeroFuelWeight,
      input.fuelOnBoard,
      input.headwind,
      input.isaDeviation,
      input.tropopause,
    );
    cruise.distance = cruiseDistance;
    cruise.seconds = step.timeElapsed;
    cruise.fuelBurned = step.fuelBurned;
  }

  // the descent with the fuel left after the cruise; an airport closer than the descent gets that share of it
  const descent = idleDescentToAirport(config, input, input.fuelOnBoard - cruise.fuelBurned);
  const descentShare =
    descent.distance > 0 && input.distance < descent.distance ? Math.max(0, input.distance) / descent.distance : 1;

  // the lighter descent is a little shorter: the cruise takes the rest of the distance, at the same time and fuel per NM
  const finalCruiseDistance = Math.max(0, input.distance - descent.distance);
  const cruiseScale = cruise.distance > 0 ? finalCruiseDistance / cruise.distance : 0;

  return {
    seconds: cruise.seconds * cruiseScale + descent.seconds * descentShare,
    fuelBurned: cruise.fuelBurned * cruiseScale + descent.fuelBurned * descentShare,
    cruiseDistance: finalCruiseDistance,
    descentDistance: descent.distance * descentShare,
  };
}
