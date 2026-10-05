// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { ServiceLook } from './ServicesLayout';

/** RAT strut position from the systems: 0 = stowed, 1 = fully deployed (both aircraft) */
export const RAT_POSITION_VAR = 'L:A32NX_RAT_STOW_POSITION';

/**
 * Maintenance stow request for the RAT, read by the systems (Rust RamAirTurbineDeployment) and written back to 0 once
 * evaluated. The systems accept it only on the ground and while no extension is commanded.
 */
export const RAT_STOW_REQUEST_VAR = 'L:A32NX_RAT_STOW_REQUEST';

/** How long the row shows the stow as in progress after a request (the stow itself takes 1 s) */
export const RAT_STOW_FEEDBACK_MS = 3_000;

/**
 * The look of the RAT stow row of the Services page. A320 FCOM DSC-29-10-20: the RAT "can be stowed only when the
 * aircraft is on the ground"; A380 FCOM DSC-29-10: the green hydraulic system powers RAT retraction, on ground.
 * - hidden: the RAT is stowed, nothing to do
 * - called: a stow was just requested
 * - disabled: the RAT is out but the aircraft is not stopped on the ground (design choice: stopped, not only on the
 *   ground, like the other ground services)
 * - inactive: the RAT is out and can be stowed
 * @param ratPosition the RAT strut position, 0 = stowed, 1 = fully deployed
 * @param stowRequested whether a stow was requested less than RAT_STOW_FEEDBACK_MS ago
 * @param onGroundAndStopped whether the aircraft is on the ground and stationary
 */
export function ratStowLook(ratPosition: number, stowRequested: boolean, onGroundAndStopped: boolean): ServiceLook {
  if (!(ratPosition > 0)) {
    return 'hidden';
  }
  if (stowRequested) {
    return 'called';
  }
  return onGroundAndStopped ? 'inactive' : 'disabled';
}

/** The translation key of the status line of the RAT stow row */
export function ratStowStatusKey(look: ServiceLook): string {
  switch (look) {
    case 'called':
      return 'Ground.Services.RatStowing';
    case 'disabled':
      return 'Ground.Services.RatStowGroundOnly';
    default:
      return 'Ground.Services.RatExtended';
  }
}
