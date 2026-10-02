// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';

/**
 * The along track distance from the aircraft to the T/D of the predicted profile, in NM (negative once past it), null
 * without predictions or without a T/D.
 */
export function distanceToTopOfDescent(guidanceController: GuidanceController): number | null {
  const profile = guidanceController.vnavDriver.mcduProfile;
  if (!profile?.isReadyToDisplay) {
    return null;
  }
  const topOfDescent = profile.findVerticalCheckpoint(VerticalCheckpointReason.TopOfDescent);
  const distanceToDestination = guidanceController.getAlongTrackDistanceToDestination();
  if (!topOfDescent || distanceToDestination === undefined || !Number.isFinite(distanceToDestination)) {
    return null;
  }
  return topOfDescent.distanceFromStart - (profile.totalFlightPlanDistance - distanceToDestination);
}
