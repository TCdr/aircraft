// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * CABIN EMER EXIT LT FAULT: the cabin emergency lighting system failed. Crew awareness without a procedure: a level 1
 * caution, no aural and no master light. STATUS: INOP SYS EMER EXIT LT.
 * The cabin emergency lighting is not simulated: the alert follows its flyPad failure.
 */

export const CABIN_EMER_EXIT_LT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9, 10];

/**
 * @param cabinEmergencyLightingFailed the flyPad failure of the cabin emergency lighting system
 * @returns whether CABIN EMER EXIT LT FAULT (and its INOP SYS EMER EXIT LT) is raised
 */
export function isCabinEmerExitLightFault(cabinEmergencyLightingFailed: boolean): boolean {
  return cabinEmergencyLightingFailed;
}
