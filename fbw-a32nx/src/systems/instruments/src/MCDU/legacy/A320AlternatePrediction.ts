// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A320AircraftConfig, A320EconParameters } from '@fmgc/flightplanning/A320AircraftConfig';
import { alternateCruiseLevel } from '@fmgc/flightplanning/plans/AlternateCruiseLevel';
import {
  AlternateFuelPrediction,
  AlternateFuelPredictor,
  AlternateSpeeds,
} from '@fmgc/guidance/vnav/AlternateFuelPredictor';
import { EconSpeeds, KG_PER_LB, tonnesToPounds } from '@fmgc/guidance/vnav/EconSpeeds';
import { FlightModel } from '@fmgc/guidance/vnav/FlightModel';
import { A32NX_FuelPred } from './A32NX_Core/A32NX_FuelPred';

export interface A320AlternateInputs {
  /** NM along the alternate flight plan, from the primary destination */
  distance: number;
  /** Feet */
  destinationElevation: number;
  /** Feet */
  alternateElevation: number;
  /** Tonnes */
  zeroFuelWeight: number;
  /** Tonnes: the fuel on board at the primary destination the weight is based on */
  fuelAtDestination: number;
  /** Knots, tailwind negative */
  headwind: number;
  /** Feet, null for the ISA tropopause */
  tropopause: number | null;
  /** °C, the deviation at the primary destination */
  isaDeviation: number;
  /** Knots, 0 without approach speeds */
  approachSpeed: number;
}

/** Design choice: the speeds when the ECON model has no result, the A320 managed speeds at cost index 0 */
const FALLBACK_SPEEDS: AlternateSpeeds = {
  climbCas: 290,
  climbMach: 0.78,
  cruiseCas: 290,
  cruiseMach: 0.78,
  descentCas: 290,
  descentMach: 0.78,
};

/**
 * The speeds of the alternate flight plan: the ECON speeds at cost index 0, at the alternate cruise level and the
 * landing weight of the primary destination.
 */
function alternateSpeeds(inputs: A320AlternateInputs, cruiseAltitude: number, weightPounds: number): AlternateSpeeds {
  const segmentAltitude = EconSpeeds.speedSegmentAltitude(cruiseAltitude);
  const weightKg = weightPounds * KG_PER_LB;
  const econ = EconSpeeds.computeEconSpeeds(A320AircraftConfig, A320EconParameters, {
    costIndex: 0,
    cruiseAltitude,
    climbWeight: weightPounds,
    cruiseWeight: weightPounds,
    descentWeight: weightPounds,
    isaDeviation: inputs.isaDeviation,
    climbHeadwind: inputs.headwind,
    cruiseHeadwind: inputs.headwind,
    descentHeadwind: inputs.headwind,
    tropopause: inputs.tropopause ?? 36_090,
    climbMinSpeed: FlightModel.getGreenDotSpeedCas(segmentAltitude, weightKg),
    cruiseMinSpeed: FlightModel.getGreenDotSpeedCas(cruiseAltitude, weightKg),
    descentMinSpeed: FlightModel.getGreenDotSpeedCas(segmentAltitude, weightKg),
  });
  return econ
    ? {
        climbCas: econ.climbSpeed,
        climbMach: econ.climbMach,
        cruiseCas: econ.cruiseSpeed,
        cruiseMach: econ.cruiseMach,
        descentCas: econ.descentSpeed,
        descentMach: econ.descentMach,
      }
    : FALLBACK_SPEEDS;
}

/**
 * The alternate flight plan prediction of the A320: climb, cruise and idle descent from the primary destination to the
 * landing at the alternate, at the weight of the primary destination, cost index 0, the constant ALTN wind and the ISA
 * deviation of the destination.
 * @returns null without a distance or weight
 */
export function a320AlternatePrediction(inputs: A320AlternateInputs): AlternateFuelPrediction | null {
  const zeroFuelWeight = tonnesToPounds(inputs.zeroFuelWeight);
  const fuelOnBoard = tonnesToPounds(inputs.fuelAtDestination);
  const cruiseAltitude = alternateCruiseLevel(inputs.distance, 'A320') * 100;
  return AlternateFuelPredictor.predict(A320AircraftConfig, {
    distance: inputs.distance,
    destinationElevation: inputs.destinationElevation,
    alternateElevation: inputs.alternateElevation,
    zeroFuelWeight,
    fuelOnBoard,
    headwind: inputs.headwind,
    isaDeviation: inputs.isaDeviation,
    tropopause: inputs.tropopause ?? undefined,
    approachSpeed: inputs.approachSpeed > 0 ? inputs.approachSpeed : undefined,
    cruiseLevelRule: 'A320',
    speeds: alternateSpeeds(inputs, cruiseAltitude, zeroFuelWeight + fuelOnBoard),
  });
}

/**
 * @param entered the ZFW of the flight plan in tonnes, null before it is entered
 * @param finalHoldingFuel tonnes
 * @returns the ZFW the alternate prediction is based on. Design choice: before the ZFW is entered the predictions use
 * the reference weight of the FM tables, so the alternate rows show indicative values instead of nothing.
 */
export function alternateZeroFuelWeight(entered: number | null, finalHoldingFuel: number): number {
  return entered ?? Math.max(A32NX_FuelPred.refWeight - finalHoldingFuel, 0);
}
