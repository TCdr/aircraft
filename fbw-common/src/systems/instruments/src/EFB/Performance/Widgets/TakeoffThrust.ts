// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { CompanyTakeoffThrust, RunwayCondition, TakeoffPerformanceResult } from '@flybywiresim/fbw-sdk';

export const isContaminatedRunway = (condition: RunwayCondition): boolean =>
  condition !== RunwayCondition.Dry && condition !== RunwayCondition.Wet;

/**
 * The takeoff thrust ratings the calculator offers, in the order of the Thrust input. FLEX is not permitted on a
 * contaminated runway; a derate is, as a certified lower rating.
 * @param derateSupported whether the calculator of the aircraft has derated levels
 */
export function offeredTakeoffThrusts(condition: RunwayCondition, derateSupported: boolean): CompanyTakeoffThrust[] {
  const ratings: CompanyTakeoffThrust[] = isContaminatedRunway(condition) ? ['TOGA'] : ['FLEX', 'TOGA'];
  if (derateSupported) {
    ratings.push('DERATED');
  }
  return ratings;
}

/** The FLEX temperatures of a result: from TREF, or the OAT when warmer, up to the maximum FLEX */
export function flexLimits(result: TakeoffPerformanceResult | undefined): {
  min: number | undefined;
  max: number | undefined;
  possible: boolean;
} {
  const min = result ? Math.ceil(Math.max(result.params.tRef, result.inputs.oat)) : undefined;
  const max = result?.flex;
  return { min, max, possible: max !== undefined && min !== undefined && min <= max };
}

export interface TakeoffRunThrust {
  rating: CompanyTakeoffThrust;
  /** The FLEX temperature in °C, for FLEX */
  flex?: number;
  /** The derated level as its thrust reduction in percent, for DERATED */
  derate?: number;
}

/**
 * The thrust of the takeoff run: the crew's choice when the result permits it, otherwise TOGA.
 * @param selectedFlex a FLEX temperature, null for TOGA, undefined for the maximum FLEX
 * @param selectedDerate a derated level, null for the deepest one the TOW permits, undefined when DERATED is not chosen
 * @returns undefined without a result
 */
export function takeoffRunThrust(
  result: TakeoffPerformanceResult | undefined,
  selectedFlex: number | null | undefined,
  selectedDerate: number | null | undefined,
): TakeoffRunThrust | undefined {
  if (result === undefined) {
    return undefined;
  }
  const deepest = result.derate;
  if (selectedDerate !== undefined && deepest !== undefined) {
    return {
      rating: 'DERATED',
      derate: selectedDerate !== null && selectedDerate <= deepest ? selectedDerate : deepest,
    };
  }
  const { possible, max } = flexLimits(result);
  if (possible && max !== undefined && selectedFlex !== null) {
    return { rating: 'FLEX', flex: Math.min(max, selectedFlex ?? max) };
  }
  return { rating: 'TOGA' };
}

/** The takeoff values of a thrust chosen in the Thrust input: the first choice of the takeoff run */
export function takeoffThrustChoice(rating: CompanyTakeoffThrust): {
  forceToga?: boolean;
  selectedFlex: number | null | undefined;
  selectedDerate: number | null | undefined;
} {
  switch (rating) {
    case 'DERATED':
      // TOGA when the TOW permits no derate: a derate is not chosen to fall back on FLEX
      return { selectedFlex: null, selectedDerate: null };
    case 'TOGA':
      return { forceToga: true, selectedFlex: null, selectedDerate: undefined };
    default:
      return { forceToga: false, selectedFlex: undefined, selectedDerate: undefined };
  }
}
