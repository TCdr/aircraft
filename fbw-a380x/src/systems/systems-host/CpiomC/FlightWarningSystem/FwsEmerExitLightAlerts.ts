// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * CABIN EMER EXIT LT FAULT (A380 FCOM PRO-ABN-ECAM-10-33, a380_fcom.txt l.163327-163345; DSC-33-40-30, l.83987):
 * "The Cabin Emergency Lighting System is failed" (l.163333), "Crew awareness." (l.163338) without a procedure: a level 1
 * caution, no aural and no master light (DSC-31 alert levels, l.71433-71437; PDF page 5541). STATUS: INOP SYS EMER EXIT
 * LT (l.163345).
 * The cabin emergency lighting is not simulated: the alert follows its flyPad failure.
 */

/** CABIN EMER EXIT LT FAULT is inhibited in phases 3 to 10 (FCOM PDF page 5541) */
export const CABIN_EMER_EXIT_LT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9, 10];

/**
 * @param cabinEmergencyLightingFailed the flyPad failure of the cabin emergency lighting system
 * @returns whether CABIN EMER EXIT LT FAULT (and its INOP SYS EMER EXIT LT) is raised
 */
export function isCabinEmerExitLightFault(cabinEmergencyLightingFailed: boolean): boolean {
  return cabinEmergencyLightingFailed;
}
