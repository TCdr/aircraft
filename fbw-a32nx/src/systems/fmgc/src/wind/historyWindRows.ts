// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { HistoryWindEntry, WindEntry } from '../flightplanning/data/wind';

/** Which history winds are listed: the A320 list is every recorded level plus the planned CRZ FL, the A380 list is historyWindRows */
export type HistoryWindRowsRule = 'A320' | 'A380';

/** The fixed levels of the A380 history winds, in feet. A380 FCOM l.42171: "FL 250, FL 150, and FL 050". */
const HISTORY_WIND_FIXED_ALTITUDES = [25_000, 15_000, 5_000];

/** The fixed levels and the CRZ FL. */
export const MAX_HISTORY_WIND_ROWS = HISTORY_WIND_FIXED_ALTITUDES.length + 1;

/**
 * Picks the history winds of the A380 out of the history winds of the FMS (A380 FCOM l.42165-42190).
 * The FMS also lists the planned CRZ FL next to the cruise level of the previous flight. The winds are "measured, and
 * stored for the CRZ FL, FL 250, FL 150, and FL 050", so the CRZ slot is the measured wind of the previous flight's
 * cruise level; the entry of the planned CRZ FL only takes the slot while no cruise wind was recorded.
 * The result is what the page shows, what INSERT HISTORY WIND inserts and what the inserted check compares.
 * @param historyWinds the history winds of the FMS, in the order they are to be listed
 * @param plannedCruiseFlightLevel the planned CRZ FL in flight level, or null if none is planned
 * @param recordedCruiseAltitude the altitude of the cruise wind recorded on the previous flight in feet, or null
 * @returns the entries to list, at most {@link MAX_HISTORY_WIND_ROWS}, in the order of historyWinds; the one in the CRZ slot is marked
 */
export function historyWindRows(
  historyWinds: Readonly<WindEntry>[],
  plannedCruiseFlightLevel: number | null,
  recordedCruiseAltitude: number | null,
): HistoryWindEntry[] {
  const cruiseAltitude =
    recordedCruiseAltitude ?? (plannedCruiseFlightLevel !== null ? plannedCruiseFlightLevel * 100 : null);

  return historyWinds
    .filter((wind) => HISTORY_WIND_FIXED_ALTITUDES.includes(wind.altitude!) || wind.altitude === cruiseAltitude)
    .map((wind) => ({ ...wind, isCruiseLevel: wind.altitude === cruiseAltitude }));
}
