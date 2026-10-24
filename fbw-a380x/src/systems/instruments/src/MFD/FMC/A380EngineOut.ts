// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A380AircraftConfig, A380EconParameters } from '@fmgc/flightplanning/A380AircraftConfig';
import { tonnesToPounds } from '@fmgc/guidance/vnav/EconSpeeds';
import {
  A380_ENGINE_OUT_LRC_COST_INDEX,
  EngineOutPerformance,
  EngineOutProfileParameters,
} from '@fmgc/guidance/vnav/engineout/EngineOutPerformance';
import { EngineOutSpeeds, engineOutSpeeds } from '@fmgc/guidance/vnav/engineout/EngineOutSpeeds';
import { a380GreenDotSpeed } from './CruiseSpeeds';

/**
 * Design choice: no ceiling is published for the A380. Fitted to what the simulated aircraft does: it holds FL352
 * level at M.70 with three engines at 338 t (N1 of the running engines about 90 %), so EO MAX at that weight and
 * ISA+15 comes out near FL367, and about FL210 at 450 t. The engine table is not smooth, so the ceiling falls steeply
 * between 340 and 400 t.
 */
const A380_WINDMILLING_DRAG_FRACTION = 1.4;

/** The engine-out performance of the A380 at a gross weight; one failed engine unless the count says otherwise */
export function a380EngineOutPerformance(grossWeightTonnes: number, failedEngines = 1): EngineOutPerformance {
  return new EngineOutPerformance(
    {
      config: A380AircraftConfig,
      econ: A380EconParameters,
      greenDotSpeedAt: (altitude) => a380GreenDotSpeed(altitude, grossWeightTonnes),
      lrcCostIndex: A380_ENGINE_OUT_LRC_COST_INDEX,
      windmillingDragFraction: A380_WINDMILLING_DRAG_FRACTION,
    },
    failedEngines,
  );
}

export type A380EngineOutCruiseMode = 'EO-LRC' | 'EO-ECON';

export interface A380EngineOutInputs {
  /** tonnes */
  grossWeight: number;
  isaDeviation: number;
  tropopause: Feet;
  /** REC MAX, the ceiling of EO MAX, feet */
  recMaxAltitude: Feet | null;
  runningEngines: number;
  cruiseFlightLevel: number | null;
  cruiseMode: A380EngineOutCruiseMode;
  /** The current cost index, flown by EO-ECON, kg/min */
  costIndex: number;
}

export interface A380EngineOutResult {
  profile: EngineOutProfileParameters;
  /** The managed speeds of the selected EO CRZ MODE */
  speeds: EngineOutSpeeds;
  /** The speeds of the EO-ECON strategy, shown for information */
  econSpeeds: EngineOutSpeeds;
}

/** The engine-out limits and managed speeds of the A380 for its gross weight, temperature and EO CRZ MODE */
export function a380EngineOut(inputs: A380EngineOutInputs): A380EngineOutResult {
  const performance = a380EngineOutPerformance(
    inputs.grossWeight,
    EngineOutPerformance.failedEngineCount(A380AircraftConfig, inputs.runningEngines),
  );
  const conditions = {
    altitude: 0,
    weight: tonnesToPounds(inputs.grossWeight),
    isaDeviation: inputs.isaDeviation,
    headwind: 0,
    tropopause: inputs.tropopause,
  };
  const profile = performance.profileParameters(conditions, null, inputs.recMaxAltitude ?? Infinity);
  const cruiseAltitude = Math.min(
    profile.maximumAltitude,
    inputs.cruiseFlightLevel !== null ? inputs.cruiseFlightLevel * 100 : Infinity,
  );
  const speeds = engineOutSpeeds(
    performance,
    conditions,
    cruiseAltitude,
    inputs.cruiseMode === 'EO-ECON' ? 'econ' : 'lrc',
    inputs.costIndex,
  );
  const econSpeeds = engineOutSpeeds(performance, conditions, cruiseAltitude, 'econ', inputs.costIndex);
  return { profile, speeds, econSpeeds };
}
