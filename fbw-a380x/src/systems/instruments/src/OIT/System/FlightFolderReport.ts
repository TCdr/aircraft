// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The FLT REPORT panel of the flight plan: the times and fuel of the flight the avionics record (OUT, OFF, ON, IN), and
 * the remarks of the crew.
 */

/** The block and flight times and the fuel on board at each of them, from the avionics */
export interface FlightReportTimes {
  readonly outMs: number | null;
  readonly offMs: number | null;
  readonly onMs: number | null;
  readonly inMs: number | null;
  readonly outFobKg: number | null;
  readonly offFobKg: number | null;
  readonly onFobKg: number | null;
  readonly inFobKg: number | null;
  /** From OUT to IN */
  readonly blockMs: number | null;
  /** From OFF to ON */
  readonly flightMs: number | null;
}

/** The report of a laptop the avionics data do not reach */
export const NO_FLIGHT_REPORT_TIMES: FlightReportTimes = {
  outMs: null,
  offMs: null,
  onMs: null,
  inMs: null,
  outFobKg: null,
  offFobKg: null,
  onFobKg: null,
  inFobKg: null,
  blockMs: null,
  flightMs: null,
};

/**
 * @param durationMs a block or flight time
 * @returns it in seconds, null for none or one that runs backwards (the sim clock was set back)
 */
export function elapsedSeconds(durationMs: number | null): number | null {
  return durationMs === null || durationMs < 0 ? null : durationMs / 1000;
}

/**
 * The take-off of the flight: the OFF time stays in the avionics records after the landing, until the next turnaround
 * @param times the times the avionics recorded
 * @returns the take-off time and fuel on board, null before the take-off and after the landing
 */
export function takeoffToRecord(times: FlightReportTimes): { timeMs: number; fobKg: number | null } | null {
  return times.offMs !== null && times.onMs === null ? { timeMs: times.offMs, fobKg: times.offFobKg } : null;
}

/** The longest remarks text. Design choice: a few lines of the report */
export const FLIGHT_REPORT_REMARKS_MAX_LENGTH = 120;
