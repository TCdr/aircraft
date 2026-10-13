// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { HoldData, HoldType } from '@fmgc/flightplanning/data/flightplan';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';

/**
 * The hold type label of the HOLD page (A380 FCOM DSC-22-FMS-20-30 HOLD TYPE, a380_fcom.txt l.36376-36392): DATABASE
 * (selected with the DATABASE button), COMPUTED (the computed hold, or the COMPUTED button), MODIFIED (as soon as the
 * flight crew changes a parameter). "The hold type label is blanked when no hold exists on the revised waypoint, or when
 * the hold is inserted with a departure or arrival procedure, or with a flight plan uplink."
 *
 * The hold the flight crew selects or changes is the modified hold of the leg; the default hold of a procedure hold
 * comes from the navigation database (HoldType.Database) and has no label.
 * @param modifiedHold the hold selected or changed by the flight crew, if any
 * @param defaultHold the hold the leg was created with, if any
 * @returns the label, with its trailing space, or an empty string
 */
export function holdTypeLabel(modifiedHold: HoldData | undefined, defaultHold: HoldData | undefined): string {
  if (modifiedHold !== undefined) {
    switch (modifiedHold.type) {
      case HoldType.Database:
        return 'DATABASE HOLD AT ';
      case HoldType.Computed:
        return 'COMPUTED HOLD AT ';
      default:
        return 'MODIFIED HOLD AT ';
    }
  }
  switch (defaultHold?.type) {
    case HoldType.Computed:
      return 'COMPUTED HOLD AT ';
    case HoldType.Pilot:
      return 'MODIFIED HOLD AT ';
    default:
      // a procedure hold (from the database), or no hold
      return '';
  }
}

/**
 * The leg and flight plan the HOLD page buttons act on. Index 0 is valid for both (the active flight plan is
 * FlightPlanIndex.Active = 0), so a missing value is null, not a falsy number: the page used `revWptIdx && revPlanIdx`,
 * which ignored every hold change on the active flight plan.
 * @param legIndex the revised leg index, or null
 * @param planIndex the revised flight plan index, or null
 * @param hasRevisedWaypoint whether a revised waypoint exists
 * @returns the leg and plan index, or null when there is nothing to revise
 */
export function holdRevisionTarget(
  legIndex: number | null,
  planIndex: FlightPlanIndex | null,
  hasRevisedWaypoint: boolean,
): { legIndex: number; planIndex: FlightPlanIndex } | null {
  if (legIndex === null || planIndex === null || !hasRevisedWaypoint) {
    return null;
  }
  return { legIndex, planIndex };
}
