// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The derated takeoff of the PERF TAKE OFF page (DRT TO, if installed): "D"NN, eight possible values D04, D08 ... D32, each
 * reducing the maximum takeoff thrust by that many percent.
 */
export const TAKEOFF_DERATE_STEP_PERCENT = 4;
export const TAKEOFF_DERATE_LEVELS = 8;

/**
 * @param entry the scratchpad entry
 * @returns the thrust reduction in percent of a DRT TO entry ("D08" gives 8), or null when it is not one of the eight values
 */
export function parseTakeoffDerateEntry(entry: string): number | null {
  const match = /^D(\d{1,2})$/.exec(entry.trim().toUpperCase());
  if (match === null) {
    return null;
  }
  const percent = parseInt(match[1]);
  const isLevel =
    percent >= TAKEOFF_DERATE_STEP_PERCENT &&
    percent <= TAKEOFF_DERATE_STEP_PERCENT * TAKEOFF_DERATE_LEVELS &&
    percent % TAKEOFF_DERATE_STEP_PERCENT === 0;
  return isLevel ? percent : null;
}

/** @returns whether the entry has the DRT TO format, a "D" followed by digits (a wrong level is out of range, not a format error) */
export function isTakeoffDerateFormat(entry: string): boolean {
  return /^D\d{1,2}$/.test(entry.trim().toUpperCase());
}

/** @returns the MCDU and thrust rating label of a derate: D04 ... D32 */
export function takeoffDerateLabel(thrustReductionPercent: number): string {
  return `D${Math.round(thrustReductionPercent).toString().padStart(2, '0')}`;
}

/**
 * The FLEX TO TEMP entry of a PERF TAKE OFF page that has the derate option: "F"NN, or the plain NN of the page without it.
 * @returns the entry without its F prefix
 */
export function stripFlexEntryPrefix(entry: string): string {
  const match = /^F\s?([+-]?\d{1,2})$/i.exec(entry.trim());
  return match === null ? entry : match[1];
}
