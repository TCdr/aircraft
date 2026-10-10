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
  let lastSignature = '';
  return bus
    .getSubscriber<ClockEvents>()
    .on('realTime')
    .atFrequency(1)
    .handle(() => {
      // One version per plan, -1 for a plan that does not exist
      const signature = WATCHED_PLANS.map((index) =>
        flightPlanInterface.has(index) ? flightPlanInterface.get(index).version : -1,
      ).join(',');
      if (signature !== lastSignature) {
        lastSignature = signature;
        onChange();
      }
    });
}
