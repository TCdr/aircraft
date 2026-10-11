// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ClockEvents, EventBus, Subscription } from '@microsoft/msfs-sdk';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { FlightPlanInterface } from '@fmgc/flightplanning/FlightPlanInterface';

/** The flight plans whose creation, deletion or modification the DATA / POSITION pages react to */
const WATCHED_PLANS = [
  FlightPlanIndex.Active,
  FlightPlanIndex.Temporary,
  FlightPlanIndex.FirstSecondary,
  FlightPlanIndex.FirstSecondary + 1,
  FlightPlanIndex.FirstSecondary + 2,
];

/**
 * A check of the watched flight plans: returns true when a plan was created, deleted or modified (its version changed)
 * since the previous call, and on the first call.
 */
export function createFlightPlansChangeDetector(flightPlanInterface: FlightPlanInterface): () => boolean {
  let lastSignature: string | null = null;
  return () => {
    // One version per plan, -1 for a plan that does not exist
    const signature = WATCHED_PLANS.map((index) =>
      flightPlanInterface.has(index) ? flightPlanInterface.get(index).version : -1,
    ).join(',');
    const changed = signature !== lastSignature;
    lastSignature = signature;
    return changed;
  };
}

/**
 * Calls `onChange` once per second at most when a flight plan is created, deleted or modified (its version changes).
 * For the pages on FmsPage (DATA, POSITION) that show flight plan data without loading a flight plan: FmsFlightPlanPage
 * does this for the pages that load one.
 * @returns the subscription, to destroy with the page
 */
export function watchFlightPlanChanges(
  bus: EventBus,
  flightPlanInterface: FlightPlanInterface,
  onChange: () => void,
): Subscription {
  const changed = createFlightPlansChangeDetector(flightPlanInterface);
  return bus
    .getSubscriber<ClockEvents>()
    .on('realTime')
    .atFrequency(1)
    .handle(() => {
      if (changed()) {
        onChange();
      }
    });
}
