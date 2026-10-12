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

/**
 * Whether SEND F-PLN REQUEST of the COMPANY F-PLN REQUEST page is disabled: one company request at a time (a pending
 * flight plan or wind request, from either MFD), and after engine start only for a secondary flight plan.
 * @param fplnRequestPending whether a company F-PLN request is pending
 * @param windRequestPending whether a company wind request is pending
 * @param enginesStarted whether the engines were started
 * @param flightPlanIndex the flight plan of the page
 */
export function isCpnyFplnSendDisabled(
  fplnRequestPending: boolean,
  windRequestPending: boolean,
  enginesStarted: boolean,
  flightPlanIndex: number,
): boolean {
  return (
    fplnRequestPending || windRequestPending || (enginesStarted && flightPlanIndex < FlightPlanIndex.FirstSecondary)
  );
}
