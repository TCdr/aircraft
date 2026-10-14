// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EfisNdMode } from '../NavigationDisplay';

/**
 * Whether the ND shows CHECK HDG (amber). A320 FCOM DSC-31-05-60, a320_fcom.txt l.45417-45422: both NDs display it
 * with a heading discrepancy of at least 5 degrees between the two sides, but not in PLAN mode.
 * l.45420: it "flashes for a few seconds on the NDs, and then it remains steady"; the FCOM gives no figure, the ND
 * flashes it 9 s (Blink9Seconds), the flash time of the PFD flags (DSC-31-40 l.47908) - a design choice.
 * @param headingDiscrepancy the EFIS side heading discrepancy (EfisSideDiscrepancyMonitor of the A32NX)
 * @param mode the ND mode
 * @returns whether CHECK HDG is shown
 */
export function isNdCheckHeadingShown(headingDiscrepancy: boolean, mode: EfisNdMode): boolean {
  return headingDiscrepancy && mode !== EfisNdMode.PLAN;
}
