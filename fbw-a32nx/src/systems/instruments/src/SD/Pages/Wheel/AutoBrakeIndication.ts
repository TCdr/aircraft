// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Colour of the AUTO BRK legend and its level on the SD WHEEL page: green when armed, amber with an ECAM caution on a
 * system failure. The failure is the BSCU autobrake fault L:A32NX_BRAKES_AUTO_BRK_FAULT (BRAKES AUTO BRK FAULT
 * caution), not an engine off.
 * @param autoBrakeFailed whether the auto brake system is failed
 * @returns 'Green' or 'Amber'
 */
export function autoBrakeIndicationClass(autoBrakeFailed: boolean): 'Green' | 'Amber' {
  return autoBrakeFailed ? 'Amber' : 'Green';
}
