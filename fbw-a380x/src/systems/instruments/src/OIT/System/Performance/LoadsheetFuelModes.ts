// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { LOADSHEET_FUEL_TANKS, TRIM_TANK_INDEX } from './Loadsheet';
import { tankCapacities, wingRefuelDistribution } from './LoadsheetFuel';
import { weightToDisplayUnit } from './PerformanceEntries';

/*
 * LOADSHEET FUEL DISTR modes besides CG TARGETING: TRIM ADJUSTMENT (the crew sets the trim tank quantity read on the
 * ECAM FUEL page, the wing tanks follow the standard refuel logic) and MANUAL DISTR (the crew sets every tank).
 * Weights in kg.
 */

export const FUEL_MODE_LABELS = ['CG TARGETING', 'TRIM ADJUSTMENT', 'MANUAL DISTR'] as const;

export const FUEL_MODE_CG_TARGETING = 0;
export const FUEL_MODE_TRIM_ADJUSTMENT = 1;
export const FUEL_MODE_MANUAL = 2;

/** Half a display step (0.1 t or 0.1 klb), with a margin for floating point */
const MANUAL_DISPLAY_TOLERANCE = 0.05 + 1e-9;

/**
 * The distribution of the TRIM ADJUSTMENT mode: the trim tank holds what the crew set, within its capacity and within
 * what the wing tanks cannot take, the wing tanks hold the rest as a refuel would distribute it.
 * @param fob the fuel on board, kg
 * @param trimFuel the trim tank quantity set by the crew, kg
 * @param density the fuel density, kg/l
 * @returns the fuel of each tank, kg
 */
export function trimAdjustmentDistribution(fob: number, trimFuel: number, density: number): number[] {
  const capacities = tankCapacities(density);
  const wingCapacity = capacities.reduce((sum, kg, tank) => (tank === TRIM_TANK_INDEX ? sum : sum + kg), 0);
  const lowest = Math.min(Math.max(0, fob - wingCapacity), capacities[TRIM_TANK_INDEX]);
  const highest = Math.max(lowest, Math.min(capacities[TRIM_TANK_INDEX], fob));
  const trim = Math.min(Math.max(trimFuel, lowest), highest);
  const distribution = wingRefuelDistribution(fob - trim, capacities);
  distribution[TRIM_TANK_INDEX] = trim;
  return distribution;
}

/**
 * The distribution of the MANUAL DISTR mode: the quantities the crew set, an empty field being an empty tank.
 * A field that shows the same as the tank of the baseline keeps the exact quantity of the baseline: the boxes show 0.1 t
 * (klbs), so a crew that types back the value it sees must not be up to 50 kg per tank off the FOB.
 * @param entries the quantity of each tank, null for a field not set
 * @param density the fuel density, kg/l
 * @param baseline the exact distribution the fields started with (CG TARGETING / previous mode), kg
 * @param metric whether the boxes show tonnes (else klbs)
 * @returns the fuel of each tank, kg, within the tank capacities
 */
export function manualDistribution(
  entries: readonly (number | null)[],
  density: number,
  baseline: readonly number[] = [],
  metric = true,
): number[] {
  const capacities = tankCapacities(density);
  const shown = (kg: number) => Math.round(weightToDisplayUnit(kg, metric) * 10);
  return LOADSHEET_FUEL_TANKS.map((_, tank) => {
    const entry = entries[tank] ?? 0;
    const exact = baseline[tank];
    const quantity = exact !== undefined && shown(entry) === shown(exact) ? exact : entry;
    return Math.min(Math.max(quantity, 0), capacities[tank]);
  });
}

/**
 * The sum of the tank boxes as the crew reads them: each tank rounded to the 0.1 step of its box. The FOB box of the
 * page shows this value, as the match with the FOB is checked on it.
 * @param distribution the fuel of each tank, kg
 * @param metric whether the boxes show tonnes (else klbs)
 * @returns the sum of the displayed tanks, t or klbs
 */
export function displayedTankTotal(distribution: readonly number[], metric: boolean): number {
  return distribution.reduce((sum, kg) => sum + Math.round(weightToDisplayUnit(kg, metric) * 10) / 10, 0);
}

/**
 * The boxes show 0.1 t (klbs), so the crew can only move fuel in those steps and the exact remainders of the tanks left
 * unchanged cannot be cancelled by any entry: the tanks match when the displayed quantities add up to the FOB within
 * half a step. Fields that kept their exact baseline and add up to the FOB within 1 kg match as well, as the displayed
 * rounding of the baseline can by itself differ from the displayed FOB.
 * @param distribution the fuel of each tank, kg
 * @param fob the fuel on board of the loading, kg
 * @param metric whether the boxes show tonnes (else klbs)
 * @returns whether the displayed tanks add up to the FOB
 */
export function manualDistributionMatchesFob(distribution: readonly number[], fob: number, metric = true): boolean {
  const exactTotal = distribution.reduce((sum, kg) => sum + kg, 0);
  if (Math.abs(exactTotal - fob) < 1) {
    return true;
  }
  return (
    Math.abs(displayedTankTotal(distribution, metric) - weightToDisplayUnit(fob, metric)) <= MANUAL_DISPLAY_TOLERANCE
  );
}

/**
 * Puts the rounding remainder of a matching manual distribution into the fullest tanks, so the computation gets tanks
 * that add up to the FOB exactly.
 * @param distribution the fuel of each tank, kg
 * @param fob the fuel on board of the loading, kg
 * @param density the fuel density, kg/l
 * @returns the fuel of each tank, kg, within the tank capacities; null when the remainder does not fit in the tanks
 */
export function fitManualDistributionToFob(
  distribution: readonly number[],
  fob: number,
  density: number,
): number[] | null {
  const capacities = tankCapacities(density);
  const fitted = [...distribution];
  let remainder = fob - fitted.reduce((sum, kg) => sum + kg, 0);
  const byQuantity = fitted.map((_, tank) => tank).sort((a, b) => fitted[b] - fitted[a]);
  for (let i = 0; i < byQuantity.length && Math.abs(remainder) > 1e-6; i++) {
    const tank = byQuantity[i];
    const quantity = Math.min(Math.max(fitted[tank] + remainder, 0), capacities[tank]);
    remainder -= quantity - fitted[tank];
    fitted[tank] = quantity;
  }
  return Math.abs(remainder) > 1 ? null : fitted;
}
