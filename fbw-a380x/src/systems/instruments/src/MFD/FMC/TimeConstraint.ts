// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

/** RTA option of the RTA panel of the VERT REV page (A380 FCOM DSC-22-FMS-20-30 P 362) */
export enum TimeConstraintType {
  At,
  AtOrBefore,
  AtOrAfter,
}

/**
 * The time constraint (RTA) of the active flight plan (FCOM: only one time constraint can exist in the flight plan).
 * The flight plan legs have no time constraint yet, so the RTA is kept by the FMS with the ident and database id of
 * its waypoint.
 */
export interface TimeConstraint {
  ident: string;
  databaseId: string;
  type: TimeConstraintType;
  /** Required time of arrival, seconds of the UTC day */
  utcSeconds: number;
}
