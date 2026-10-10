// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { WindEntry } from '@fmgc/flightplanning/data/wind';

/** The fixed levels of the history winds, in feet. A380 FCOM l.42171: "FL 250, FL 150, and FL 050". */
const HISTORY_WIND_FIXED_ALTITUDES = [25_000, 15_000, 5_000];

/** The fixed levels and the CRZ FL. */
export const MAX_HISTORY_WIND_ROWS = HISTORY_WIND_FIXED_ALTITUDES.length + 1;

/**
 * Picks the rows of the history wind page out of the history winds of the FMS.
 * The FMS also lists the cruise level of the previous flight, which is not a fixed level and may not be the planned
 * CRZ FL. A380 FCOM l.42171: the winds are "stored for the CRZ FL, FL 250, FL 150, and FL 050", so there is at most
 * one cruise level row: the planned CRZ FL, or the recorded cruise level while no CRZ FL is planned.
 * @param historyWinds the history winds of the FMS, in the order they are to be shown
 * @param cruiseFlightLevel the planned CRZ FL in flight level, or null if none is planned
 * @returns the rows to show, at most {@link MAX_HISTORY_WIND_ROWS}, in the order of historyWinds
 */
export function historyWindRows(historyWinds: Readonly<WindEntry>[], cruiseFlightLevel: number | null) {
  const cruiseAltitude = cruiseFlightLevel !== null ? cruiseFlightLevel * 100 : null;
  // The row of the planned CRZ FL (none of its own if that is a fixed level), else the recorded cruise level
  const cruiseRow =
    cruiseAltitude !== null
      ? historyWinds.find((wind) => wind.altitude === cruiseAltitude)
      : historyWinds.find((wind) => !HISTORY_WIND_FIXED_ALTITUDES.includes(wind.altitude!));

  return historyWinds.filter((wind) => HISTORY_WIND_FIXED_ALTITUDES.includes(wind.altitude!) || wind === cruiseRow);
}
