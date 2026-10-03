// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Whether the engine LP valve symbol of the SD FUEL page is green. FCOM DSC-28-20-F LP VALVE (ENG) INDICATIONS:
 * - Inline - Green: The valve is open.
 * - Inline - Amber: The valve is open, with the ENG MASTER switch OFF.
 * - Crossline - Amber: The ENG valve is fully closed.
 * - Transit - Amber: The valve is in transit.
 * @param openPercentage the LP valve position, 0 (closed) to 100 (open)
 * @param engineMasterOn whether the ENG MASTER switch of that engine is ON
 * @returns true for green, false for amber
 */
export function isEngineLpValveGreen(openPercentage: number, engineMasterOn: boolean): boolean {
  return openPercentage >= 100 && engineMasterOn;
}
