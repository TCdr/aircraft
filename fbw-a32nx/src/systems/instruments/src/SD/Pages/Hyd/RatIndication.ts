// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The RAT strut position above which the SD HYD page shows the RAT not stowed (0 = stowed, 1 = fully deployed) */
const RAT_NOT_STOWED_POSITION = 0.1;

/** How the SD HYD page shows the RAT */
export interface RatIndication {
  /** The RAT is not stowed: green filled triangle and green line (white outline triangle when stowed) */
  readonly notStowed: boolean;
  /** The RAT legend in amber (white otherwise) */
  readonly legendAmber: boolean;
}

/**
 * The RAT of the SD HYD page, A320 FCOM DSC-29-10-30 HYD page item (6) RAT (a320_fcom.txt l.43983-43988): white when
 * "The RAT is stowed", green when "The RAT is not stowed", amber when "Pressure for stowing the RAT has been applied, or
 * the RAT pump is not available".
 * The FCOM text (its figure is not in it) leaves which part turns amber open: here the RAT legend, the triangle keeping
 * the stowed / not stowed colour. Not simulated: a RAT pump failure, so "the RAT pump is not available" never shows.
 * @param stowPosition L:A32NX_RAT_STOW_POSITION, 0 = stowed, 1 = fully deployed
 * @param stowing L:A32NX_RAT_STOWING, the maintenance stow moves the strut in (systems shared/ram_air_turbine_deployment.rs)
 */
export function ratIndication(stowPosition: number, stowing: boolean): RatIndication {
  return {
    notStowed: stowPosition > RAT_NOT_STOWED_POSITION,
    legendAmber: stowing,
  };
}
