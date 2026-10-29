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

/** Design choice: the manual distribution has to match the FOB within the rounding of an entry in kg or lb */
const MANUAL_FOB_TOLERANCE = 1;

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
 * (klbs), so a crew that types back the value it sees must not be up to 50 kg per tank off the FOB. FCOM
 * PER-LOD-LAI-FUL: the tanks must be exactly identical to the FOB, there is no tolerance.
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
 * @param distribution the fuel of each tank, kg
 * @param fob the fuel on board of the loading, kg
 * @returns whether the tanks add up to the FOB; no operator tolerance in this model
 */
export function manualDistributionMatchesFob(distribution: readonly number[], fob: number): boolean {
  const total = distribution.reduce((sum, kg) => sum + kg, 0);
  return Math.abs(total - fob) < MANUAL_FOB_TOLERANCE;
}
