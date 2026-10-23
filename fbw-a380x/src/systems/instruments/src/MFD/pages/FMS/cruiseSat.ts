// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

/**
 * The SAT row of the CRZ tab (A380 FCOM l.42335-42345) for a plan without a SAT entry at the selected waypoint: the SAT
 * at the cruise flight level (performanceData.cruiseTemperaturePilotEntry) that applies to every waypoint without an
 * entry of its own.
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

/** The SAT entry that applies at the selected cruise waypoint, as the flight plan propagates it */
export interface WaypointSat {
  /** feet */
  altitude: number;
  /** °C */
  temperature: number;
  /** Entered at this waypoint; false when it comes from an earlier waypoint (shown small, cannot be cleared) */
  enteredHere: boolean;
}

/**
 * What the ALT/SAT row shows for the selected cruise waypoint: its SAT entry, else the SAT at the cruise flight level
 * that applies to every waypoint without one.
 */
export function waypointSatRow(
  planRow: ReturnType<typeof cruiseSatRow>,
  planSatIsPilotEntered: boolean,
  sat: WaypointSat | null,
) {
  if (sat === null) {
    return { flightLevel: planRow.flightLevel, sat: planRow.sat, enteredByPilot: planSatIsPilotEntered };
  }
  return { flightLevel: Math.round(sat.altitude / 100), sat: sat.temperature, enteredByPilot: sat.enteredHere };
}

/**
 * The SAT entry for a waypoint after the crew changed one field of the row. ALT and SAT can be modified one at a time;
 * the entry exists once both have a value.
 * @returns the entry, or null if the row would not have both
 */
export function editedWaypointSat(
  shown: { flightLevel: number | null; sat: number | null },
  edit: { flightLevel?: number | null; sat?: number | null },
): { altitude: number; temperature: number } | null {
  const flightLevel = edit.flightLevel !== undefined ? edit.flightLevel : shown.flightLevel;
  const temperature = edit.sat !== undefined ? edit.sat : shown.sat;
  return flightLevel === null || temperature === null ? null : { altitude: flightLevel * 100, temperature };
}
