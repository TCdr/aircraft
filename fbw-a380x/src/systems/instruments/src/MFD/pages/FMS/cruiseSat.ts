// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

/**
 * The SAT row of the CRZ tab. A380 FCOM l.42335-42345: the crew enters an ALT/SAT pair; this FMS models one SAT at
 * the cruise flight level (performanceData.cruiseTemperaturePilotEntry), so the ALT is the CRZ FL and is not editable.
 * Not modelled: other altitudes and the propagation to the down-path waypoints (l.42345).
 *
 * @param cruiseFl the cruise flight level of the loaded flight plan, or null if there is none
 * @param satEntry the SAT to show at the cruise flight level (the entry, or the FMS default), or null
 * @param cruiseOver the cruise is over for this plan (active plan, or a copy of it, after the cruise phase): the CRZ
 * tab is inactive, the SAT with it
 */
export function cruiseSatRow(cruiseFl: number | null, satEntry: number | null, cruiseOver = false) {
  return {
    flightLevel: cruiseFl,
    sat: cruiseFl === null ? null : satEntry,
    satEditable: cruiseFl !== null && !cruiseOver,
  };
}
