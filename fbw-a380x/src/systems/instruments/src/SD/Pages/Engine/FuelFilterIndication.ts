// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The amber CLOGGED indication below the fuel flow: the fuel filter is clogged, with the ENG FUEL FILTER CLOGGED alert.
 * Design choice: as the alert (FlightWarningSystem/EngineFuelFilterAlerts.ts), it shows while the engine runs, the fuel
 * flowing through the filter.
 * @param clogged the fuel filter clog failure (L:A32NX_ENGINE_n_FUEL_FILTER_CLOGGED)
 * @param engineState L:A32NX_ENGINE_STATE:n, 1 = running
 */
export function fuelFilterCloggedShown(clogged: boolean, engineState: number): boolean {
  return clogged && engineState === 1;
}
