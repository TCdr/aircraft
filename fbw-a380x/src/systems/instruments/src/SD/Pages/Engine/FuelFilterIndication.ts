// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The CLOGGED indication below the fuel flow. A380 FCOM DSC-70-90 FUEL FLOW (a380_fcom.txt l.113330-113332): "Fuel
 * filter is clogged. Associated with the ECAM alert ENG 1(2)(3)(4) FUEL FILTER CLOGGED"; the FCOM figure (PDF page 4110)
 * shows CLOGGED in amber below the fuel flow value.
 * Design choice: as the ENG FUEL FILTER CLOGGED alert (FlightWarningSystem/EngineFuelFilterAlerts.ts), it shows while the
 * engine runs, the fuel flowing through the filter.
 * @param clogged the fuel filter clog failure (L:A32NX_ENGINE_n_FUEL_FILTER_CLOGGED, systems engine/fuel_filter_failure.rs)
 * @param engineState L:A32NX_ENGINE_STATE:n, 1 = running
 */
export function fuelFilterCloggedShown(clogged: boolean, engineState: number): boolean {
  return clogged && engineState === 1;
}
