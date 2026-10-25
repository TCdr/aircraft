// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ApproachPhaseAutoEngageRule } from '@fmgc/flightplanning/AircraftConfigTypes';
import { LateralMode } from '@shared/autopilot';

/**
 * Whether sequencing the DECEL pseudo waypoint switches the FMS to the approach phase.
 * @param rule the aircraft rule
 * @param lateralMode the engaged lateral mode
 * @param altitude the present altitude, ft
 * @param destinationElevation the destination elevation, ft; the height is taken above it
 */
export function shouldAutoEngageApproachPhase(
  rule: ApproachPhaseAutoEngageRule,
  lateralMode: LateralMode,
  altitude: Feet,
  destinationElevation: Feet,
): boolean {
  return rule.lateralModes.includes(lateralMode) && altitude - destinationElevation < rule.maxHeightAboveDestination;
}
