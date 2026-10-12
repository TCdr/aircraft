// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';

/**
 * Whether the CPNY F-PLN REQUEST button of a flight plan is disabled.
 * - FCOM DSC-22-FMS-20-30 INIT page: selectable before engine start, with no active flight plan and no secondary flight
 *   plan request pending. A pending active request still gives access to the page.
 * - FCOM SEC INDEX page: a secondary flight plan request needs no other flight plan request pending.
 * - A company wind uplink in progress blocks every flight plan request.
 * @param windUplinkInProgress whether a company wind uplink is in progress
 * @param requestedForPlan the flight plan of the pending company F-PLN request, null without one
 * @param enginesStarted whether the engines were started
 * @param hasActivePlanWithCityPair whether the active flight plan has a city pair
 * @param flightPlanIndex the flight plan of the button
 */
export function isCpnyFplnButtonDisabled(
  windUplinkInProgress: boolean,
  requestedForPlan: FlightPlanIndex | null,
  enginesStarted: boolean,
  hasActivePlanWithCityPair: boolean,
  flightPlanIndex: number,
): boolean {
  if (windUplinkInProgress) {
    return true;
  }
  if (flightPlanIndex === FlightPlanIndex.Active) {
    return (
      enginesStarted ||
      hasActivePlanWithCityPair ||
      (requestedForPlan !== null && requestedForPlan >= FlightPlanIndex.FirstSecondary)
    );
  }
  // A SEC plan: blocked by a request pending for another flight plan, not by its own
  return requestedForPlan !== null && requestedForPlan !== flightPlanIndex;
}
