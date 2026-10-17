// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EfisNdMode } from '../NavigationDisplay';

/**
 * Whether the ND shows CHECK HDG (amber): both NDs display it with a heading discrepancy of at least 5 degrees between
 * the two sides, but not in PLAN mode. It flashes for a few seconds, then stays steady. Design choice: the manual gives
 * no time, so the ND flashes it 9 s (Blink9Seconds), the flash time of the PFD flags.
 * @param headingDiscrepancy the EFIS side heading discrepancy (EfisSideDiscrepancyMonitor of the A32NX)
 * @param mode the ND mode
 * @returns whether CHECK HDG is shown
 */
export function isNdCheckHeadingShown(headingDiscrepancy: boolean, mode: EfisNdMode): boolean {
  return headingDiscrepancy && mode !== EfisNdMode.PLAN;
}
