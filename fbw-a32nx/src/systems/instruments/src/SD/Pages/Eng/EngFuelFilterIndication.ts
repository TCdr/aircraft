// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The fuel filter CLOG indication below the fuel used. A320 FCOM DSC-70-90-40 FUEL FILTER CLOG INDICATION
 * (a320_fcom.txt l.64497-64499): "Indicates that the pressure loss across the fuel filter is excessive." The FCOM figure
 * of the ENGINE SD page (2019 FCOM PDF page 1890) shows CLOG in amber below the F.USED value.
 * Design choice: as the ENG FUEL FILTER CLOG alert (systems-host FWC/Logic/EngineFuelFilterAlerts), it shows while the
 * engine runs, the fuel flowing through the filter.
 * @param clogged the fuel filter clog failure (L:A32NX_ENGINE_n_FUEL_FILTER_CLOGGED, systems engine/fuel_filter_failure.rs)
 * @param engineState L:A32NX_ENGINE_STATE:n, 1 = running
 */
export function fuelFilterClogShown(clogged: boolean, engineState: number): boolean {
  return clogged && engineState === 1;
}
