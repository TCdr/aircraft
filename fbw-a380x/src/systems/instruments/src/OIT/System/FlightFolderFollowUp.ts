// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { distanceTo } from 'msfs-geo';
import {
  EffFlightPlan,
  lastFlownLineIndex,
  NAV_LOG_ORIGIN_KEY,
  navLogLines,
  navLogOfpRow,
  setNavLogActual,
} from './FlightFolderFlightPlan';

/*
 * The automatic flight follow-up (FFU) of the navigation log: in the FMS cruise phase the laptop collects the aircraft
 * position, and a waypoint of the plan it passes close to is marked as flown with the time and the fuel of that moment.
 * The crew then validates the data with FUEL CHK.
 */

/** The position is collected every minute... */
export const FFU_SLOW_PERIOD_MS = 60_000;
/** ... and every 20 seconds when a waypoint is close */
export const FFU_FAST_PERIOD_MS = 20_000;
/** A waypoint closer than this to a collected position is considered overflown, nm */
export const FFU_OVERFLOWN_NM = 7;
/**
 * A waypoint closer than this to the collected position is close. Design choice: the distance an aircraft flies in more
 * than two slow periods at the cruise speeds of an A380, so that the fast period is on well before the 7 nm circle.
 */
export const FFU_NEAR_NM = 20;

/** What the avionics give the laptop: nothing at all (null) when their data do not reach it */
export interface FollowUpAvionics {
  /** The FMS flight phase is cruise */
  readonly cruise: boolean;
  readonly latitudeDeg: number | null;
  readonly longitudeDeg: number | null;
  /** The fuel on board, kg */
  readonly fobKg: number | null;
}

/**
 * @param latitudes the latitude of each IR, null when the IR gives none
 * @param longitudes the longitude of each IR
 * @returns the position of the first IR that gives both, null when none does
 */
export function firstIrPosition(
  latitudes: readonly (number | null)[],
  longitudes: readonly (number | null)[],
): { latitudeDeg: number; longitudeDeg: number } | null {
  for (let ir = 0; ir < latitudes.length; ir++) {
    const latitudeDeg = latitudes[ir];
    const longitudeDeg = longitudes[ir];
    if (latitudeDeg !== null && longitudeDeg !== null) {
      return { latitudeDeg, longitudeDeg };
    }
  }
  return null;
}

/**
 * @param plan the flight plan
 * @param latitudeDeg the aircraft position
 * @param longitudeDeg the aircraft position
 * @returns the waypoint the aircraft may still overfly that is nearest to it: after the last waypoint flown, not skipped
 * by NEXT WPT, not the origin, and with a position (a waypoint the crew inserted has none). A waypoint missed earlier in
 * the plan is not marked late, as its time would come after the one of a later waypoint.
 */
function nearestCandidate(
  plan: EffFlightPlan,
  latitudeDeg: number,
  longitudeDeg: number,
): { key: string; distanceNm: number } | null {
  let nearest: { key: string; distanceNm: number } | null = null;
  const lines = navLogLines(plan);
  for (let index = lastFlownLineIndex(lines) + 1; index < lines.length; index++) {
    const line = lines[index];
    const row = navLogOfpRow(plan, line.key);
    if (
      row === undefined ||
      row.latitudeDeg === null ||
      row.longitudeDeg === null ||
      line.key === NAV_LOG_ORIGIN_KEY ||
      line.skipped ||
      line.ataMs !== null
    ) {
      continue;
    }
    const distance = distanceTo(
      { lat: latitudeDeg, long: longitudeDeg },
      { lat: row.latitudeDeg, long: row.longitudeDeg },
    );
    if (nearest === null || distance < nearest.distanceNm) {
      nearest = { key: line.key, distanceNm: distance };
    }
  }
  return nearest;
}

/** What one collection of the position gave */
export interface FollowUpSample {
  /** The waypoint the sample marked as overflown, null when there was none */
  readonly flownKey: string | null;
}

/**
 * The timing of the automatic flight follow-up. The next collection is planned at a time of the clock, not counted
 * from frame steps: the clock reads 0 before its first event and may be set back by a flight reload.
 */
export class FollowUpSampler {
  private nextDueMs: number | null = null;
  private lastSampleMs = 0;

  /** The next collection is due at once: another folder follows */
  public reset(): void {
    this.nextDueMs = null;
  }

  /**
   * @param nowMs the simulation time, unix ms
   * @param avionics what the avionics give the laptop, null when their data do not reach it
   * @param plan the flight plan of the folder that is followed
   * @returns the collection that was made, null when none was due
   */
  public update(nowMs: number, avionics: FollowUpAvionics | null, plan: EffFlightPlan): FollowUpSample | null {
    if (avionics === null || !avionics.cruise) {
      this.nextDueMs = null;
      return null;
    }
    if (!(nowMs > 0) || avionics.latitudeDeg === null || avionics.longitudeDeg === null) {
      return null;
    }
    const due = this.nextDueMs === null || nowMs >= this.nextDueMs || nowMs < this.lastSampleMs;
    if (!due) {
      return null;
    }
    this.lastSampleMs = nowMs;

    let flownKey: string | null = null;
    const nearest = nearestCandidate(plan, avionics.latitudeDeg, avionics.longitudeDeg);
    if (nearest !== null && nearest.distanceNm < FFU_OVERFLOWN_NM) {
      // The fuel used is counted from the fuel on board at take-off, which the origin holds
      const takeoffFobKg = plan.followUp.actuals[NAV_LOG_ORIGIN_KEY]?.afobKg ?? null;
      setNavLogActual(plan, nearest.key, {
        ataMs: nowMs,
        afobKg: avionics.fobKg,
        afuKg: takeoffFobKg !== null && avionics.fobKg !== null ? takeoffFobKg - avionics.fobKg : null,
      });
      flownKey = nearest.key;
    }

    const next = nearestCandidate(plan, avionics.latitudeDeg, avionics.longitudeDeg);
    const near = next !== null && next.distanceNm <= FFU_NEAR_NM;
    this.nextDueMs = nowMs + (near ? FFU_FAST_PERIOD_MS : FFU_SLOW_PERIOD_MS);
    return { flownKey };
  }
}

/**
 * The take-off gives the origin its time and fuel on board, and the fuel used at the next waypoints is counted from it.
 * The avionics repeat the take-off: the first one stays, except that a fuel on board they gave late fills the gap.
 * @param plan the flight plan
 * @param timeMs the take-off time, unix ms
 * @param fobKg the fuel on board at take-off, kg; null when unknown
 */
export function recordTakeoff(plan: EffFlightPlan, timeMs: number, fobKg: number | null): void {
  if (plan.navLog.length === 0) {
    return;
  }
  const origin = plan.followUp.actuals[NAV_LOG_ORIGIN_KEY];
  if ((origin?.ataMs ?? null) !== null) {
    if (fobKg !== null && origin.afobKg === null) {
      setNavLogActual(plan, NAV_LOG_ORIGIN_KEY, { afobKg: fobKg });
    }
    return;
  }
  setNavLogActual(plan, NAV_LOG_ORIGIN_KEY, { ataMs: timeMs, afobKg: fobKg });
}
