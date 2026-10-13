// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { AltitudeConstraint, AltitudeDescriptor } from '@flybywiresim/fbw-sdk';
import { ConstraintLegLike, constraintsAboveCruiseLevel } from '@fmgc/components/fms-messages/FmsMessageConditions';

/** What the CRZ FL constraint deletion needs from a flight plan */
export interface CruiseLevelConstraintPlan {
  readonly allLegs: readonly ConstraintLegLike[];
  readonly activeLegIndex: number;
  readonly firstMissedApproachLegIndex: number;
  setPilotEnteredAltitudeConstraintAt(
    index: number,
    isDescentConstraint: boolean,
    constraint?: AltitudeConstraint,
  ): void;
}

/**
 * Deletes the altitude constraints at or above a new CRZ FL from the legs not flown yet (see
 * cruiseLevelConstraintAction: A320 FCOM l.15144-15160, A380 FCOM l.27100-27104); the window across the CRZ FL keeps its
 * lower limit, as an AT OR ABOVE constraint. The caller shows CSTR DEL ABOVE CRZ FL (A320) / CONSTRAINTS ABOVE CRZ FL:
 * DELETED (A380) when constraints were deleted.
 * Not done: the A380 deletion of the descent constraints at or above a step altitude (l.27101-27102).
 * @param plan the flight plan whose CRZ FL changed
 * @param cruiseFlightLevel the new CRZ FL (flight level, e.g. 350)
 * @returns the number of constraints deleted or cut
 */
export function deleteConstraintsAboveCruiseLevel(plan: CruiseLevelConstraintPlan, cruiseFlightLevel: number): number {
  const changes = constraintsAboveCruiseLevel(
    plan.allLegs,
    plan.activeLegIndex,
    plan.firstMissedApproachLegIndex,
    cruiseFlightLevel * 100,
  );
  for (const change of changes) {
    const kept: AltitudeConstraint | undefined =
      change.action.kind === 'keepLower'
        ? { altitudeDescriptor: AltitudeDescriptor.AtOrAboveAlt1, altitude1: change.action.lowerAltitude }
        : undefined;
    plan.setPilotEnteredAltitudeConstraintAt(change.index, change.isDescent, kept);
  }
  return changes.length;
}
