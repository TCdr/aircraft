// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FlightPlanLegFlags } from '@fmgc/flightplanning/legs/FlightPlanLeg';

/**
 * INSERT OR ERASE TMPY F-PLN FIRST: the DIR key does not open the DIRECT TO page while a temporary flight plan that
 * is not a direct to is pending.
 * A temporary flight plan of a direct to starts with the turning point (T-P) of the direct to, the FROM leg of the
 * temporary flight plan (FlightPlanService.temporaryInsert).
 * @param hasTemporary a temporary flight plan is pending
 * @param temporaryFromLeg the FROM leg of the temporary flight plan (the leg before its active leg), if any
 * @returns whether the DIR key is refused with the message
 */
export function isDirectToKeyBlockedByTemporary(
  hasTemporary: boolean,
  temporaryFromLeg: { isDiscontinuity: boolean; flags?: number } | null | undefined,
): boolean {
  if (!hasTemporary) {
    return false;
  }
  const createdByDirectTo =
    !!temporaryFromLeg &&
    temporaryFromLeg.isDiscontinuity === false &&
    ((temporaryFromLeg.flags ?? 0) & FlightPlanLegFlags.DirectToTurningPoint) !== 0;
  return !createdByDirectTo;
}
