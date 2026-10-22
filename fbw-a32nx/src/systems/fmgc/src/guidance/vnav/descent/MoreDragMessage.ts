// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SpeedbrakeDecelerationSegment } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import {
  DescentAltitudeConstraint,
  VerticalCheckpoint,
  VerticalCheckpointReason,
} from '@fmgc/guidance/vnav/profile/NavGeometryProfile';

/**
 * The MORE DRAG message of the FMA (third line, middle and right columns) and of the MCDU (amber, type II), A320 FCOM
 * DSC-22_30-100 FLIGHT MODE ANNUNCIATOR (a320_fcom.txt l.33617-33623, l.33703-33710): "DES mode is engaged, idle is
 * selected, and either: The aircraft is above the vertical profile and the predicted intercept point of the theoretical
 * profile is at less than 2 NM from the next ALT CSTR, or In auto speed control and the aircraft enters a speedbrake
 * decelerating segment." DSC-22_30-70-50 (l.29949-29955): "MORE DRAG comes up on the PFD and the MCDU, and remains
 * there as long as more drag (speedbrakes) is still required" and "Whenever the intercept point is predicted to be
 * close to a constrained waypoint".
 *
 * Design choices:
 * - "Idle is selected": the A/THR is in THR IDLE (L:A32NX_AUTOTHRUST_MODE), the thrust mode of DES with an idle path or
 *   above the profile.
 * - The predicted intercept point is the one of the ND profile (VerticalProfileManager interceptNdWithGuidanceProfile,
 *   the DES intercept pseudo waypoint). An intercept beyond the next ALT CSTR (the constraint would be passed above the
 *   profile) counts as less than 2 NM from it.
 * - The speedbrake decelerating segments are the parts of the descent profile that the profile computation could only
 *   fly with the speedbrakes (BaseGeometryProfile speedbrakeDecelerationSegments).
 */
export const MORE_DRAG_INTERCEPT_MARGIN_NM = 2;

export interface MoreDragInputs {
  /** DES is the active vertical mode */
  desModeEngaged: boolean;
  /** The A/THR is in THR IDLE */
  thrustIdle: boolean;
  /** The aircraft is above the descent profile (linear deviation above zero) */
  aboveProfile: boolean;
  /** The next ALT CSTR distance minus the predicted intercept distance, NM; null without intercept or constraint */
  interceptMarginToNextAltitudeConstraintNm: number | null;
  /** Managed speed */
  speedAuto: boolean;
  /** The aircraft is inside a speedbrake decelerating segment of the descent profile */
  inSpeedbrakeDecelerationSegment: boolean;
}

export function isMoreDragMessageActive(inputs: MoreDragInputs): boolean {
  if (!inputs.desModeEngaged || !inputs.thrustIdle) {
    return false;
  }
  const interceptTooLate =
    inputs.aboveProfile &&
    inputs.interceptMarginToNextAltitudeConstraintNm !== null &&
    inputs.interceptMarginToNextAltitudeConstraintNm < MORE_DRAG_INTERCEPT_MARGIN_NM;
  return interceptTooLate || (inputs.speedAuto && inputs.inSpeedbrakeDecelerationSegment);
}

/**
 * The distance between the predicted descent profile intercept and the next ALT CSTR, positive when the intercept is
 * before the constraint. The checkpoints, the constraints and the present position are in the same frame (the ND
 * profile).
 * @param checkpoints the ND profile checkpoints
 * @param constraints the descent altitude constraints
 * @param presentPositionDistanceFromStart the aircraft distance from start in that frame
 * @returns the margin in NM, or null without an intercept ahead or without a constraint ahead
 */
export function interceptMarginToNextAltitudeConstraintNm(
  checkpoints: readonly VerticalCheckpoint[],
  constraints: readonly DescentAltitudeConstraint[],
  presentPositionDistanceFromStart: number,
): number | null {
  const intercept = checkpoints.find(
    (checkpoint) =>
      checkpoint.reason === VerticalCheckpointReason.InterceptDescentProfileManaged &&
      checkpoint.distanceFromStart >= presentPositionDistanceFromStart,
  );
  if (!intercept) {
    return null;
  }

  let nextConstraintDistance: number | null = null;
  for (const constraint of constraints) {
    if (
      constraint.distanceFromStart > presentPositionDistanceFromStart &&
      (nextConstraintDistance === null || constraint.distanceFromStart < nextConstraintDistance)
    ) {
      nextConstraintDistance = constraint.distanceFromStart;
    }
  }
  if (nextConstraintDistance === null) {
    return null;
  }

  return nextConstraintDistance - intercept.distanceFromStart;
}

/**
 * @param segments the speedbrake decelerating segments of the descent profile
 * @param distanceFromStart the aircraft distance from start in the descent profile frame
 */
export function isInSpeedbrakeDecelerationSegment(
  segments: readonly SpeedbrakeDecelerationSegment[],
  distanceFromStart: number,
): boolean {
  return segments.some(
    (segment) =>
      distanceFromStart >= Math.min(segment.startDistanceFromStart, segment.endDistanceFromStart) &&
      distanceFromStart <= Math.max(segment.startDistanceFromStart, segment.endDistanceFromStart),
  );
}
