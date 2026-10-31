// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The passengers of the GSX boarding and deboarding, as the flyPad counts them.
 *
 * GSX Pro manual for MSFS, "DEVELOPERS - Interfacing with GSX", Interfacing with the Passengers simulation:
 * - "L:FSDT_GSX_NUMPASSENGERS: This variable can be set from a gauge code, and GSX will use it in place of its own
 *   calculation, to set the correct number of passengers to match the airplane."
 * - "L:FSDT_GSX_NUMPASSENGERS_BOARDING_TOTAL / _DEBOARDING_TOTAL: ... keep a running count of passengers across
 *   multiple Buses."
 * - (pilots and crew) "They must be set before Boarding or Deboarding, usually together with the
 *   FSDT_GSX_NUMPASSENGERS."
 * - GSX state variables: 1 service can be called, 2 not available, 3 bypassed, 4 requested, 5 being performed,
 *   6 completed.
 * And GSX resets the variables it reads to 0 when it restarts (manual, Remote Control Mode).
 */

/** The GSX service states of the L:FSDT_GSX_*_STATE variables */
export const GSX_STATE_REQUESTED = 4;
export const GSX_STATE_PERFORMING = 5;
export const GSX_STATE_COMPLETED = 6;

/** The GSX Remote API service ids of the passenger services */
const BOARDING_ID = 'Boarding';
const DEBOARDING_ID = 'Deboarding';

/** The passenger counts the Services page follows */
export interface GsxPaxCounts {
  /** Passengers seated in the aircraft (the Payload page's seats) */
  onBoard: number;
  /** Passengers planned on the Payload page (the desired seats) */
  planned: number;
  /** L:FSDT_GSX_NUMPASSENGERS_BOARDING_TOTAL, GSX's running count of the boarded passengers */
  gsxBoarded: number;
  /** L:FSDT_GSX_NUMPASSENGERS_DEBOARDING_TOTAL, GSX's running count of the deboarded passengers */
  gsxDeboarded: number;
}

export interface GsxPaxProgress {
  current: number;
  total: number;
}

/** The Remote API states in which a passenger service has a count to show: running, finishing or done */
const COUNTED_STATES = ['performing', 'completing', 'completed'];

/**
 * The passenger counter of the boarding or deboarding step: boarded / planned passengers while boarding, deboarded /
 * passengers that were on board while deboarding. The counts are the flyPad's (the Payload page's seats, which the
 * payload sync boards as GSX counts them) and GSX's running totals: GSX's own Remote API progress is per bus and uses
 * its own passenger number when the aircraft does not give one.
 * Design choice: the counter shows while the service runs and once it is done; null (GSX's own progress then) for
 * the other services, while the service is idle, and with no planned passengers.
 * @param serviceId the Remote API service id
 * @param state the Remote API service state (available, requested, performing, completing, completed...)
 * @param counts the passenger counts
 */
export function gsxPaxProgress(
  serviceId: string,
  state: string | undefined,
  counts: GsxPaxCounts,
): GsxPaxProgress | null {
  if (state === undefined || !COUNTED_STATES.includes(state)) {
    return null;
  }
  const valid = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
  const onBoard = valid(counts.onBoard);
  const planned = valid(counts.planned);
  switch (serviceId) {
    case BOARDING_ID: {
      if (planned === 0) {
        return null;
      }
      // the seats follow GSX's count with the payload sync on; GSX's own count when the sync was turned off
      const boarded = state === 'completed' ? onBoard : Math.max(onBoard, valid(counts.gsxBoarded));
      return { current: Math.min(boarded, planned), total: planned };
    }
    case DEBOARDING_ID: {
      const deboarded = valid(counts.gsxDeboarded);
      const total = onBoard + deboarded;
      return total > 0 ? { current: deboarded, total } : null;
    }
    default:
      return null;
  }
}

export interface GsxArrivalInput {
  /** The FMGC flight phase is DONE */
  flightPhaseDone: boolean;
  /** Passengers seated in the aircraft */
  onBoard: number;
  /** GSX requested or runs the deboarding */
  deboardingActive: boolean;
  /** GSX requested, runs or completed the boarding of this turnaround */
  boardingStarted: boolean;
}

/**
 * Whether the aircraft is on an arrival turnaround (deboarding) and not on a departure one (boarding). The A32NX DONE
 * phase only ends when the next flight is entered in the MCDU, so it alone would keep a turnaround at the same
 * airport on the arrival list, and GSX would board the previous flight's passenger number.
 * It is a departure from the moment the boarding starts, and when nobody is on board and no deboarding is requested
 * or running. Design choice: nobody on board is read as "deboarded" whatever deboarded them (GSX with the flyPad seats
 * synced, the Payload page, or a flyPad reloaded afterwards), because the flyPad cannot tell those apart; the cost is
 * that an arrival with 0 passengers does not list the Deboard row.
 */
export function gsxIsArrival(input: GsxArrivalInput): boolean {
  if (!input.flightPhaseDone || input.boardingStarted) {
    return false;
  }
  return input.onBoard > 0 || input.deboardingActive;
}

export interface GsxPaxAnnounceInput {
  /** The page may give GSX the number (the Services page: linked to GSX and GSX runs; the Payload page: always) */
  ready: boolean;
  /** L:FSDT_GSX_BOARDING_STATE */
  boardingState: number;
  /** L:FSDT_GSX_DEBOARDING_STATE */
  deboardingState: number;
  /** After landing, until the deboarding is done (gsxIsArrival): GSX deboards the passengers on board */
  arrival: boolean;
  counts: GsxPaxCounts;
  /** The current value of L:FSDT_GSX_NUMPASSENGERS */
  announced: number;
}

/**
 * The passenger number to give GSX in L:FSDT_GSX_NUMPASSENGERS, or null to leave it: the passengers on board for a
 * deboarding (after landing, or once GSX deboarding is requested), else the planned passengers. The one rule of every
 * flyPad page that writes it (Services and Payload pages), so they never write different numbers.
 * GSX uses the number in place of its own count only when it is set before the boarding or deboarding starts.
 * Design choice: still given while the service is requested (GSX takes it when the service starts), not while GSX
 * boards or deboards (performing: GSX counts then, and the seats change), not when there is nobody to give (0 lets GSX
 * use its own number, as before), and only when it changed (GSX resets it to 0 when it restarts, so it is checked
 * again).
 */
export function gsxPaxToAnnounce(input: GsxPaxAnnounceInput): number | null {
  if (!input.ready || input.boardingState === GSX_STATE_PERFORMING || input.deboardingState === GSX_STATE_PERFORMING) {
    return null;
  }
  const deboarding = input.arrival || input.deboardingState === GSX_STATE_REQUESTED;
  const pax = Math.round(deboarding ? input.counts.onBoard : input.counts.planned);
  if (!Number.isFinite(pax) || pax <= 0 || pax === input.announced) {
    return null;
  }
  return pax;
}
