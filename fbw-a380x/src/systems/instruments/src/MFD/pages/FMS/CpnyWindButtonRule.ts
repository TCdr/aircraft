// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** What the CPNY WIND REQUEST button depends on, for the flight plan of its page */
export interface CpnyWindButtonState {
  /** The flight phase no longer allows a wind request for this plan (active, or a copy of it, after CRZ) */
  flightPhaseDisallows: boolean;
  /** A temporary flight plan exists */
  tmpyExists: boolean;
  /** A company uplink (F-PLN or wind) is in progress */
  uplinkInProgress: boolean;
  /** The uplink in progress is the company wind request of this plan (REQUEST PENDING ...) */
  cpnyWindUplinkInProgress: boolean;
  /** Received company winds wait for insertion in this plan */
  availableForPlan: boolean;
  /** Received company winds wait for insertion in any plan */
  availableForAnyPlan: boolean;
}

/**
 * Whether the CPNY WIND REQUEST button is disabled. A company F-PLN uplink in progress disables it, but not its own
 * pending wind request: then the button shows REQUEST PENDING and still opens the COMPANY WIND DATA REQUEST page.
 */
export function isCpnyWindButtonDisabled(state: CpnyWindButtonState): boolean {
  return (
    state.flightPhaseDisallows ||
    state.tmpyExists ||
    (state.uplinkInProgress && !state.cpnyWindUplinkInProgress) ||
    (!state.availableForPlan && state.availableForAnyPlan)
  );
}

/** What a click on the CPNY WIND REQUEST button does */
export type CpnyWindButtonClickAction = 'menu' | 'open-request-page';

/**
 * With the free text option, the button opens the COMPANY WIND DATA REQUEST page (also while the request is
 * pending); once company winds are received for the plan it opens the INSERT/CLEAR menu instead.
 */
export function cpnyWindButtonClickAction(availableForPlan: boolean): CpnyWindButtonClickAction {
  return availableForPlan ? 'menu' : 'open-request-page';
}
