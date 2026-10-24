// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A320AircraftConfig, A320EconParameters } from '@fmgc/flightplanning/A320AircraftConfig';
import { FlightModel } from '@fmgc/guidance/vnav/FlightModel';
import { tonnesToPounds } from '@fmgc/guidance/vnav/EconSpeeds';
import { EngineOutPerformance, EngineOutProfileParameters } from '@fmgc/guidance/vnav/engineout/EngineOutPerformance';
import { EngineOutSpeeds, engineOutSpeeds } from '@fmgc/guidance/vnav/engineout/EngineOutSpeeds';

/**
 * Design choice: fitted so that the engine-out long range ceilings of the model are within about 1500 ft of the two
 * FCOM values (FL203 at 62 t, FL182 at 70 t).
 */
const A320_WINDMILLING_DRAG_FRACTION = 0.4;

/** The engine-out performance of the A320 at a gross weight */
export function a320EngineOutPerformance(grossWeightTonnes: number): EngineOutPerformance {
  return new EngineOutPerformance({
    config: A320AircraftConfig,
    econ: A320EconParameters,
    greenDotSpeedAt: (altitude) => FlightModel.getGreenDotSpeedCas(altitude, grossWeightTonnes * 1000),
    lrcCostIndex: null,
    windmillingDragFraction: A320_WINDMILLING_DRAG_FRACTION,
  });
}

export interface A320EngineOutInputs {
  /** tonnes */
  grossWeight: number;
  isaDeviation: number;
  tropopause: Feet;
  /** The EO REC MAX of the PROG page, as a flight level */
  engineOutRecMaxFlightLevel: number | null;
  /** The cost index the crew entered over EO LRC, kg/min, or null for EO LRC */
  costIndexOverwrite: number | null;
}

export interface A320EngineOutResult {
  profile: EngineOutProfileParameters;
  speeds: EngineOutSpeeds;
}

/**
 * The engine-out profile parameters and managed speeds of the A320 for its gross weight and temperature. The cruise
 * level is limited by the EO REC MAX of the PROG page.
 */
export function a320EngineOut(inputs: A320EngineOutInputs, cruiseFlightLevel: number | null): A320EngineOutResult {
  const performance = a320EngineOutPerformance(inputs.grossWeight);
  const conditions = {
    altitude: 0,
    weight: tonnesToPounds(inputs.grossWeight),
    isaDeviation: inputs.isaDeviation,
    headwind: 0,
    tropopause: inputs.tropopause,
  };
  const recMaxAltitude = inputs.engineOutRecMaxFlightLevel !== null ? inputs.engineOutRecMaxFlightLevel * 100 : null;
  const profile = performance.profileParameters(conditions, recMaxAltitude);
  const cruiseAltitude = Math.min(
    profile.maximumAltitude,
    cruiseFlightLevel !== null ? cruiseFlightLevel * 100 : Infinity,
  );
  const speeds = engineOutSpeeds(
    performance,
    conditions,
    cruiseAltitude,
    inputs.costIndexOverwrite !== null ? 'econ' : 'lrc',
    inputs.costIndexOverwrite ?? 0,
  );
  return { profile, speeds };
}
