// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A320AircraftConfig, A320EconParameters } from '@fmgc/flightplanning/A320AircraftConfig';
import {
  ComputationMemo,
  EconSpeeds,
  OptimumLevelTrip,
  roundToStep,
  tonnesToPounds,
} from '@fmgc/guidance/vnav/EconSpeeds';
import { FlightModel } from '@fmgc/guidance/vnav/FlightModel';
import { LevelAtmosphere } from '@fmgc/guidance/vnav/CruiseLevelAtmosphere';

/** The OPT FL needs at least 5 min of cruise */
const MIN_CRUISE_MINUTES = 5;

/**
 * Design choice: the VNAV predicts the climb and the descent only for the CRZ FL, so the cruise time left at the other
 * levels uses average A320neo ground distances (about 140 NM to climb to FL350, 3 NM per 1000 ft of descent)
 */
const CLIMB_DISTANCE_PER_THOUSAND_FEET = 4;
const DESCENT_DISTANCE_PER_THOUSAND_FEET = 3;

export interface ProgOptimumFlightLevelInputs {
  /** tonnes, or null when unknown */
  grossWeight: number | null;
  /** the REC MAX flight level, or null when unknown */
  recMaxFlightLevel: number | null;
  /** the FMS engine-out condition */
  engineOut: boolean;
  /** kg/min, or null when not entered */
  costIndex: number | null;
  /** °C */
  isaDeviation: number;
  /** knots, negative for a tailwind */
  headwind: number;
  /** feet */
  tropopause: number;
  /** The wind and temperature per level; the constant ISA deviation and headwind above are used without it */
  atmosphere?: LevelAtmosphere;
  /** ground distance to the destination in NM, or null when unknown */
  distanceToDestination: number | null;
  /** feet */
  currentAltitude: number;
  /** feet */
  destinationElevation: number;
}

/** The weight entries of the FMS gross weight */
export interface ProgOptimumFlightLevelWeightEntries {
  /** % MAC, or null when not entered */
  zeroFuelWeightCenterOfGravity: number | null;
  /** tonnes, or null when not entered */
  blockFuel: number | null;
  anEngineOn: boolean;
}

/**
 * Whether the crew has entered the weights the OPT FL is computed from. The BLOCK fuel counts only before engine
 * start: after it the gross weight uses the fuel quantity, and INIT B (the only page to enter BLOCK) is replaced by
 * FUEL PRED, so a flight set up with the engines running never gets a BLOCK entry.
 */
export function progOptimumFlightLevelWeightsEntered(entries: ProgOptimumFlightLevelWeightEntries): boolean {
  return entries.zeroFuelWeightCenterOfGravity !== null && (entries.anEngineOn || entries.blockFuel !== null);
}

/**
 * The OPT FL of the MCDU PROG page: the most economic level for the cost index, weight, temperature and wind (minimum
 * trip cost per ground mile at the ECON Mach of each level), not above the REC MAX, and leaving at least 5 min of
 * cruise between the climb and the descent. Rounded down to a multiple of 5 (Design choice: no display resolution is
 * published). Null (dashes) without gross weight, REC MAX or cost index, with an engine out, or when no level fits.
 */
export function progOptimumFlightLevel(inputs: ProgOptimumFlightLevelInputs): number | null {
  if (
    inputs.grossWeight === null ||
    inputs.recMaxFlightLevel === null ||
    inputs.costIndex === null ||
    inputs.engineOut
  ) {
    return null;
  }

  const weightKg = inputs.grossWeight * 1000;
  const trip: OptimumLevelTrip | null =
    inputs.distanceToDestination !== null && Number.isFinite(inputs.distanceToDestination)
      ? {
          remainingDistance: inputs.distanceToDestination,
          currentAltitude: inputs.currentAltitude,
          destinationElevation: inputs.destinationElevation,
          minCruiseMinutes: MIN_CRUISE_MINUTES,
          climbDistancePerThousandFeet: CLIMB_DISTANCE_PER_THOUSAND_FEET,
          descentDistancePerThousandFeet: DESCENT_DISTANCE_PER_THOUSAND_FEET,
        }
      : null;

  const optimum = EconSpeeds.optimumFlightLevel(
    A320AircraftConfig,
    A320EconParameters,
    inputs.costIndex,
    {
      altitude: 0,
      weight: tonnesToPounds(inputs.grossWeight),
      isaDeviation: inputs.isaDeviation,
      headwind: inputs.headwind,
      tropopause: inputs.tropopause,
    },
    inputs.recMaxFlightLevel,
    (altitude) => FlightModel.getGreenDotSpeedCas(altitude, weightKg),
    trip,
    inputs.atmosphere ? (altitude) => inputs.atmosphere!.at(altitude) : undefined,
  );
  return optimum !== null ? Math.floor(optimum / 5) * 5 : null;
}

/** The OPT FL search takes milliseconds: it is recomputed only when a rounded input changes */
export class ProgOptimumFlightLevelCache {
  private readonly memo = new ComputationMemo<number | null>();

  get(inputs: ProgOptimumFlightLevelInputs): number | null {
    return this.memo.get(
      [
        roundToStep(inputs.grossWeight, 1),
        inputs.recMaxFlightLevel,
        inputs.engineOut,
        inputs.costIndex,
        roundToStep(inputs.isaDeviation, 1),
        roundToStep(inputs.headwind, 5),
        inputs.atmosphere?.key ?? null,
        inputs.tropopause,
        roundToStep(inputs.distanceToDestination, 10),
        roundToStep(inputs.currentAltitude, 1000),
        roundToStep(inputs.destinationElevation, 100),
      ],
      () => progOptimumFlightLevel(inputs),
    );
  }
}
