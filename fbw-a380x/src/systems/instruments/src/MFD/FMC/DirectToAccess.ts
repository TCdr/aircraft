// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FlightPlanLegFlags } from '@fmgc/flightplanning/legs/FlightPlanLeg';

/**
 * INSERT OR ERASE TMPY F-PLN FIRST (A380 FCOM DSC-22-FMS-20-110, a380_fcom.txt l.45663, l.45667-45670): "A temporary
 * flight plan (that is not created by a direct to) is pending, and the flight crew tries to access the direct to revision
 * via the KCCU." The DIR key then does not open the DIRECT TO page.
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
