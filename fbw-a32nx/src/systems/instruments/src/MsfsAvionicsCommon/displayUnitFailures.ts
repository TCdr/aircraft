// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A320Failure } from '@failures';

/*
 * Which flyPad failure blanks which A32NX display unit (DU).
 *
 * A failed DU shows a blank screen (A320 FCOM DSC-31-05-60 "FAILURE OF A DU": a blank screen with an amber "F",
 * a distorted display or a blank screen with "INVALID DISPLAY UNIT"), drawn here as the DU's OFF state, like the
 * PFD already does.
 *
 * The CAPT/F/O PFD and ND gauges are told apart by their panel.cfg `Index` (1 = CAPT, 2 = F/O).
 */

/** The panel.cfg gauge `Index` of the captain's PFD and ND. */
const CAPTAIN_DISPLAY_INDEX = 1;

/** The flyPad failure of the CAPT (display index 1) or F/O (any other index) PFD display unit. */
export function pfdDisplayUnitFailure(displayIndex: number): number {
  return displayIndex === CAPTAIN_DISPLAY_INDEX ? A320Failure.LeftPfdDisplay : A320Failure.RightPfdDisplay;
}

/** The flyPad failure of the CAPT (display index 1) or F/O (any other index) ND display unit. */
export function ndDisplayUnitFailure(displayIndex: number): number {
  return displayIndex === CAPTAIN_DISPLAY_INDEX ? A320Failure.LeftNdDisplay : A320Failure.RightNdDisplay;
}

/** The flyPad failure of the upper ECAM display unit, the one that shows the E/WD. */
export const UPPER_ECAM_DISPLAY_UNIT_FAILURE: number = A320Failure.UpperEcamDisplay;

/** The flyPad failure of the lower ECAM display unit, the one that shows the SD (both the React and SDv2 layers). */
export const LOWER_ECAM_DISPLAY_UNIT_FAILURE: number = A320Failure.LowerEcamDisplay;

/**
 * The L:var through which an ND gauge tells the native weather/terrain layer (ndwxr) whether its DU shows the ND
 * picture: 1 while the DU is ON (powered, brightness above 0, self-test done, not failed), 0 otherwise. Without it,
 * the radar returns and the terrain would be drawn on a blank (failed, switched off or self-testing) ND.
 */
export function ndDisplayUnitShowingVar(displayIndex: number): string {
  return `L:A32NX_ND_${displayIndex === CAPTAIN_DISPLAY_INDEX ? 'L' : 'R'}_DU_SHOWING_PICTURE`;
}
