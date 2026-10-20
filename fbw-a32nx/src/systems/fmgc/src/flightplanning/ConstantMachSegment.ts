// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { FmgcFlightPhase } from '@shared/flightphase';
import { ReadonlyFlightPlanElement } from '@fmgc/flightplanning/legs/ReadonlyFlightPlanLeg';
import { SegmentClass } from '@fmgc/flightplanning/segments/SegmentClass';

/**
 * Marks the start or the end waypoint of the constant Mach segment (CMS) on its flight plan leg.
 * A flight plan holds one CMS at most: a new one replaces the old markers.
 */
export type ConstantMachSegmentMarker = { kind: 'start'; mach: number; endsAtTopOfDescent: boolean } | { kind: 'end' };

export interface ConstantMachSegment {
  mach: number;
  /** The waypoint at which the CMS Mach becomes the managed target */
  startLegIndex: number;
  /** The last waypoint flown at the CMS Mach, null when the segment ends at the top of descent */
  endLegIndex: number | null;
}

export interface ConstantMachLimits {
  min: number;
  max: number;
}

/** Design choice: no range is published for the A320 CMS Mach; it is the range of the cruise Mach entry (MMO 0.82) */
export const A320ConstantMachLimits: ConstantMachLimits = { min: 0.15, max: 0.82 };

/** 0.30 to MMO - delta MMO. Design choice: delta MMO is 0.02 (no value is published), like the ECON Mach limit */
export const A380ConstantMachLimits: ConstantMachLimits = { min: 0.3, max: 0.87 };

export enum ConstantMachSegmentDeletionReason {
  CruisePhaseExit,
  EngineOut,
  AlternateEnabled,
  SecondaryActivated,
}

/** The A320 announces every automatic deletion of the active CMS */
export const A320AnnouncedConstantMachDeletions: readonly ConstantMachSegmentDeletionReason[] = [
  ConstantMachSegmentDeletionReason.CruisePhaseExit,
  ConstantMachSegmentDeletionReason.EngineOut,
  ConstantMachSegmentDeletionReason.AlternateEnabled,
  ConstantMachSegmentDeletionReason.SecondaryActivated,
];

/** The A380 announces only the deletion at the end of the cruise phase */
export const A380AnnouncedConstantMachDeletions: readonly ConstantMachSegmentDeletionReason[] = [
  ConstantMachSegmentDeletionReason.CruisePhaseExit,
];

/** The CMS of a flight plan, null when there is none or when one of its waypoints was removed */
export function findConstantMachSegment(legs: readonly ReadonlyFlightPlanElement[]): ConstantMachSegment | null {
  let start: { index: number; mach: number; endsAtTopOfDescent: boolean } | null = null;

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (leg.isDiscontinuity === true || !leg.constantMachSegment) {
      continue;
    }

    const marker = leg.constantMachSegment;
    if (marker.kind === 'start') {
      start = { index: i, mach: marker.mach, endsAtTopOfDescent: marker.endsAtTopOfDescent };
    } else if (start !== null && !start.endsAtTopOfDescent) {
      return { mach: start.mach, startLegIndex: start.index, endLegIndex: i };
    }
  }

  return start?.endsAtTopOfDescent ? { mach: start.mach, startLegIndex: start.index, endLegIndex: null } : null;
}

/** Whether a leg belongs to the CMS: the legs after the start waypoint, up to and including the end waypoint */
export function isLegInConstantMachSegment(segment: ConstantMachSegment | null, legIndex: number): boolean {
  return (
    segment !== null &&
    legIndex > segment.startLegIndex &&
    (segment.endLegIndex === null || legIndex <= segment.endLegIndex)
  );
}

/**
 * Whether a waypoint can be the start or the end of a CMS: a cruise waypoint, outside the departure and arrival
 * procedures. Without predictions the en-route waypoints are taken as the cruise ones.
 * @param isPredictedInCruise whether the predictions place the waypoint in the cruise, undefined without predictions
 */
export function canLegBoundConstantMachSegment(
  leg: ReadonlyFlightPlanElement | undefined,
  isPredictedInCruise?: boolean,
): boolean {
  if (!leg || leg.isDiscontinuity === true || !leg.isXF() || leg.segment.class !== SegmentClass.Enroute) {
    return false;
  }

  return isPredictedInCruise !== false;
}

export interface ConstantMachWaypointChoice {
  legIndex: number;
  ident: string;
  /** Selectable as the start: before the end, and not the current start */
  canBeStart: boolean;
  /** Selectable as the end: after the start, and not the current end */
  canBeEnd: boolean;
}

/**
 * The waypoints the flight crew can select as the CMS start or end: the cruise waypoints down path of the aircraft
 * @param startLegIndex the selected start, null when none is selected
 * @param endLegIndex the selected end, null when the segment ends at the top of descent
 * @param isPredictedInCruise whether the predictions place a leg in the cruise, undefined without predictions
 */
export function constantMachWaypointChoices(
  legs: readonly ReadonlyFlightPlanElement[],
  activeLegIndex: number,
  startLegIndex: number | null,
  endLegIndex: number | null,
  isPredictedInCruise: (legIndex: number) => boolean | undefined,
): ConstantMachWaypointChoice[] {
  const choices: ConstantMachWaypointChoice[] = [];

  for (let i = Math.max(0, activeLegIndex); i < legs.length; i++) {
    const leg = legs[i];
    if (leg.isDiscontinuity === true || !canLegBoundConstantMachSegment(leg, isPredictedInCruise(i))) {
      continue;
    }

    choices.push({
      legIndex: i,
      ident: leg.ident,
      canBeStart: i !== startLegIndex && (endLegIndex === null || i < endLegIndex),
      canBeEnd: i !== endLegIndex && (startLegIndex === null || i > startLegIndex),
    });
  }

  return choices;
}

/**
 * The CMS of the active flight plan can be created or changed up to the end of the cruise phase, and not when an engine
 * is out. A secondary flight plan is not flown: it takes a CMS at any time.
 */
export function isConstantMachSegmentEntryAllowed(
  flightPhase: FmgcFlightPhase,
  engineOut: boolean,
  isSecondaryPlan = false,
): boolean {
  return isSecondaryPlan || (flightPhase <= FmgcFlightPhase.Cruise && !engineOut);
}

type ConstantMachEntryResult = { mach: number } | { error: 'format' | 'range' };

/** Parses a CMS Mach entry: .NN or 0.NN, rounded to 0.01 */
export function parseConstantMachEntry(entry: string, limits: ConstantMachLimits): ConstantMachEntryResult {
  if (!/^0?\.\d{1,2}$/.test(entry)) {
    return { error: 'format' };
  }

  const mach = Math.round(parseFloat(entry) * 100) / 100;
  if (mach < limits.min || mach > limits.max) {
    return { error: 'range' };
  }

  return { mach };
}

/** The CMS is deleted when the flight phase changes from cruise to another one */
export function isCruisePhaseExit(previousPhase: FmgcFlightPhase, nextPhase: FmgcFlightPhase): boolean {
  return previousPhase === FmgcFlightPhase.Cruise && nextPhase !== FmgcFlightPhase.Cruise;
}
