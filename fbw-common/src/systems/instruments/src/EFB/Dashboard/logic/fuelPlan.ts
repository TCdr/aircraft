// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The planned fuel on board over a navlog fix, in the unit of the OFP */
export interface FuelPlanPoint {
  secondsAfterTakeoff: number;
  fuelOnBoard: number;
}

/** The fuel plan of a SimBrief navlog: the fixes with a time and a planned fuel on board, in navlog order */
export const navlogFuelPlan = (
  navlog: { time_total: string; fuel_plan_onboard: string }[] | undefined,
): FuelPlanPoint[] => {
  if (!Array.isArray(navlog)) {
    return [];
  }
  return navlog
    .map((fix) => ({
      secondsAfterTakeoff: Number.parseInt(fix.time_total, 10),
      fuelOnBoard: Number.parseFloat(fix.fuel_plan_onboard),
    }))
    .filter((point) => Number.isFinite(point.secondsAfterTakeoff) && Number.isFinite(point.fuelOnBoard));
};

/**
 * The planned fuel on board at a time after takeoff, interpolated between the two fixes around it; before the first
 * fix and after the last one the nearest fix holds. Null without a plan.
 */
export const plannedFuelOnBoard = (plan: readonly FuelPlanPoint[], secondsAfterTakeoff: number): number | null => {
  if (plan.length === 0) {
    return null;
  }
  if (secondsAfterTakeoff <= plan[0].secondsAfterTakeoff) {
    return plan[0].fuelOnBoard;
  }
  for (let i = 1; i < plan.length; i++) {
    const before = plan[i - 1];
    const after = plan[i];
    if (secondsAfterTakeoff <= after.secondsAfterTakeoff) {
      const span = after.secondsAfterTakeoff - before.secondsAfterTakeoff;
      const share = span > 0 ? (secondsAfterTakeoff - before.secondsAfterTakeoff) / span : 1;
      return before.fuelOnBoard + share * (after.fuelOnBoard - before.fuelOnBoard);
    }
  }
  return plan[plan.length - 1].fuelOnBoard;
};

/**
 * Fuel on board minus the planned fuel on board now, kg: positive when above the plan. Null before takeoff or without
 * a fuel plan.
 * @param toKg converts a navlog fuel figure (OFP unit) to kilograms
 */
export const fuelVersusPlanKg = (
  fobKg: number,
  plan: readonly FuelPlanPoint[],
  takeoffUnixSeconds: number | null,
  nowUnixSeconds: number,
  toKg: (ofpValue: number) => number,
): number | null => {
  if (takeoffUnixSeconds === null) {
    return null;
  }
  const planned = plannedFuelOnBoard(plan, nowUnixSeconds - takeoffUnixSeconds);
  return planned === null ? null : fobKg - toKg(planned);
};
