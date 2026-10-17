// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { isEngineRunning } from '../../Common/EngineRunning';

/**
 * The fuel filter CLOG indication, in amber below the fuel used: the pressure loss across the fuel filter is excessive.
 * Design choice: as the ENG FUEL FILTER CLOG alert (systems-host FWC/Logic/EngineFuelFilterAlerts), it shows while the
 * engine runs, the fuel flowing through the filter.
 * @param clogged the fuel filter clog failure (L:A32NX_ENGINE_n_FUEL_FILTER_CLOGGED, systems engine/fuel_filter_failure.rs)
 * @param engineState L:A32NX_ENGINE_STATE:n, 1 = running
 */
export function fuelFilterClogShown(clogged: boolean, engineState: number): boolean {
  return clogged && isEngineRunning(engineState);
}
