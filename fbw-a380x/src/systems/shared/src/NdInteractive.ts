// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The interactive ND (A380 FCOM DSC-31-20-30-90): with the KCCU cursor, the flight crew revises the flight plan on the
 * lateral ND in ARC, PLAN or ROSE-NAV mode. The ND sends the revisions to the FMS, which answers with the state of the
 * temporary flight plan.
 */

export type NdInteractiveSide = 'L' | 'R';

/** An element the flight crew clicked on the ND: a waypoint, NAVAID or airport (ND symbol data) */
export interface NdInteractiveElement {
  databaseId: string;
  ident: string;
  location: { lat: number; long: number };
  /** A waypoint (or airport) of the flight plan on the ND, else a navigation database element */
  flightPlan: boolean;
  airport: boolean;
}

/** The DIRECT TO options (FCOM DSC-31-20-30-90 P 11) */
export enum NdDirectToOption {
  Direct = 'DIRECT',
  DirectWithAbeam = 'DIRECT WITH ABEAM',
  CrsIn = 'CRS IN',
  CrsOut = 'CRS OUT',
}

/** The CRS IN or CRS OUT course of a DIR TO (FCOM P 11), magnetic unless isTrue */
export interface NdDirectToCourse {
  course: number;
  isTrue: boolean;
}

/** An entry error the ND detected, shown as an FMS message */
export type NdEntryError = 'format' | 'outOfRange';

export type NdInteractiveRequest =
  /**
   * DIR TO the target with an option (a new temporary flight plan when the target or the option changes); the course
   * the flight crew entered for CRS IN or CRS OUT, else the default course of a flight plan target
   */
  | {
      side: NdInteractiveSide;
      kind: 'directTo';
      target: NdInteractiveElement;
      option: NdDirectToOption;
      course?: NdDirectToCourse;
    }
  /** DELETE * of a flight plan waypoint (a temporary flight plan) */
  | { side: NdInteractiveSide; kind: 'delete'; element: NdInteractiveElement }
  /** INSERT NEXT WPT: the next waypoint after the revised flight plan waypoint (a temporary flight plan) */
  | { side: NdInteractiveSide; kind: 'insertNextWpt'; revised: NdInteractiveElement; next: NdInteractiveElement }
  /** DATA of an airport: the DATA / AIRPORT page on the MFD of the side */
  | { side: NdInteractiveSide; kind: 'data'; element: NdInteractiveElement }
  /** INSERT (or ERASE) the temporary flight plan, e.g. INSERT DIR TO * */
  | { side: NdInteractiveSide; kind: 'insertTmpy' }
  | { side: NdInteractiveSide; kind: 'eraseTmpy' }
  /**
   * A waypoint entry (an ident, a lat/long, a place/bearing/distance or a place-bearing/place-bearing) of the KCCU, or
   * the lat/long of a click on a blank area of the ND: the FMS answers with the matching elements (a pilot-defined
   * waypoint is stored). The database ids the flight crew chose on the DUPLICATE page, for the places of the entry that
   * are not unique.
   */
  | { side: NdInteractiveSide; kind: 'resolve'; requestId: number; text: string; chosen: string[] }
  /** An entry error the ND detected (e.g. the CRS format) */
  | { side: NdInteractiveSide; kind: 'error'; error: NdEntryError };

/** The answer of the FMS to a KCCU entry: one element, several (the DUPLICATE page), or none (an FMS message) */
export interface NdInteractiveResolved {
  side: NdInteractiveSide;
  requestId: number;
  candidates: NdInteractiveElement[];
  /** The distance of each candidate from the aircraft in NM, null when unknown (the DUPLICATE page) */
  distances: (number | null)[];
}

/** The temporary flight plan, for the INSERT and ERASE buttons and the DIRECT TO page of the ND */
export interface NdInteractiveState {
  /** A temporary flight plan exists */
  tmpy: boolean;
  /** The temporary flight plan is a DIR TO */
  directTo: boolean;
  /** DIR TO: the target, its distance from the aircraft in NM (null when not computed) */
  directToTarget: string | null;
  directToDistance: number | null;
  /** DIR TO: the estimated UTC of arrival at the target, in seconds of the day (null when not computed) */
  directToUtc: number | null;
  /** DIR TO with CRS IN or CRS OUT: the course of the temporary flight plan (null without one) */
  directToCourse: NdDirectToCourse | null;
  /** The waypoints of the active flight plan the DIR TO can go to (the list of the DIRECT TO page) */
  waypoints: NdInteractiveElement[];
}

export interface NdInteractiveEvents {
  nd_interactive_request: NdInteractiveRequest;
  nd_interactive_resolved: NdInteractiveResolved;
  nd_interactive_state: NdInteractiveState;
}
