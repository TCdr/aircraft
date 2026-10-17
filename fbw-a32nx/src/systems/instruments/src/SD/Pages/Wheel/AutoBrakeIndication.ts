// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Colour of the AUTO BRK legend and its level on the SD WHEEL page: green when armed, amber with an ECAM caution on a
 * system failure, not when an engine is off. No AUTO BRK failure is modelled yet (BRAKES AUTO BRK FAULT), so the
 * legend stays green.
 * @param autoBrakeFailed whether the auto brake system is failed
 * @returns 'Green' or 'Amber'
 */
export function autoBrakeIndicationClass(autoBrakeFailed: boolean): 'Green' | 'Amber' {
  return autoBrakeFailed ? 'Amber' : 'Green';
}
