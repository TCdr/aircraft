// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Common } from '../common';
import { EconSpeeds, EconSpeedSet } from '../EconSpeeds';
import { EngineOutConditions, EngineOutCruiseStrategy, EngineOutPerformance } from './EngineOutPerformance';

/** The engine-out managed speeds: green dot in the climb, the strategy Mach in the cruise */
export interface EngineOutSpeeds {
  /** EO-GDOT, knots CAS */
  greenDotSpeed: Knots;
  greenDotMach: Mach;
  /** The cruise Mach of the strategy and the CAS it is */
  cruiseMach: Mach;
  cruiseSpeed: Knots;
}

/**
 * @param cruiseAltitude the level the aircraft cruises at: the CRZ FL, or EO MAX when that is lower
 * @param costIndex the cost index of the EO-ECON strategy, kg/min
 */
export function engineOutSpeeds(
  performance: EngineOutPerformance,
  conditions: EngineOutConditions,
  cruiseAltitude: Feet,
  strategy: EngineOutCruiseStrategy,
  costIndex: number,
): EngineOutSpeeds {
  const climbAltitude = EconSpeeds.speedSegmentAltitude(cruiseAltitude);
  const cruiseMach = performance.cruiseMach(cruiseAltitude, conditions, strategy, costIndex);
  const delta = Common.getDelta(cruiseAltitude, cruiseAltitude > conditions.tropopause);
  return {
    greenDotSpeed: Math.round(performance.greenDotSpeedAt(climbAltitude)),
    greenDotMach: performance.greenDotMach(cruiseAltitude, conditions),
    cruiseMach: Math.round(cruiseMach * 100) / 100,
    cruiseSpeed: Math.round(Common.machToCas(cruiseMach, delta)),
  };
}

/** The ECON speeds with the climb and cruise speeds of the engine-out strategy; the descent speeds stay ECON */
export function withEngineOutSpeeds(econ: EconSpeedSet, speeds: EngineOutSpeeds): EconSpeedSet {
  return {
    ...econ,
    climbSpeed: speeds.greenDotSpeed,
    climbMach: speeds.greenDotMach,
    cruiseSpeed: speeds.cruiseSpeed,
    cruiseMach: speeds.cruiseMach,
  };
}
