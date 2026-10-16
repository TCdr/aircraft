// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Colour of the AUTO BRK legend and its level on the SD WHEEL page. A320 FCOM DSC-32-30-20: "In green when auto brake is
 * armed [...] In amber, along with an ECAM caution, to indicate a system failure". The page used to show it amber
 * whenever an engine was not running (single-engine taxi, engine failure), with no caution. The failure is the BSCU
 * autobrake fault L:A32NX_BRAKES_AUTO_BRK_FAULT (BRAKES AUTO BRK FAULT caution).
 * @param autoBrakeFailed whether the auto brake system is failed
 * @returns 'Green' or 'Amber'
 */
export function autoBrakeIndicationClass(autoBrakeFailed: boolean): 'Green' | 'Amber' {
  return autoBrakeFailed ? 'Amber' : 'Green';
}
