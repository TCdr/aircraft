// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The distance cell of a F-PLN (and DIR TO) row, in NM, 0 to 9999.
 * Blank when the distance is not computed: the lateral path or a pseudo waypoint can be momentarily without a distance
 * while the flight plan geometry is recomputed, and a "NaN" text would overflow into the next cells of the line.
 * @param distance in NM, undefined when there is none
 */
export function flightPlanDistanceCell(distance: number | undefined): string {
  if (distance === undefined || !Number.isFinite(distance)) {
    return '';
  }
  return Math.round(Math.max(0, Math.min(9999, distance))).toFixed(0);
}
