// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * ENG 1(2) FUEL FILTER CLOG: the fuel filter is clogged. Crew awareness: maintenance action is due, the filter is
 * bypassed and short term engine operation is not affected. An amber caution inhibited in phases 3, 4, 5, 7 and 8, no
 * procedure line.
 */

export const FUEL_FILTER_CLOG_PHASE_INHIBITION = [3, 4, 5, 7, 8];

export interface EngineFuelFilterInputs {
  masterOn: boolean;
  /** The FADEC reports the engine running (ENGINE_STATE On) */
  engineRunning: boolean;
  /** The fuel filter clog failure (L:A32NX_ENGINE_n_FUEL_FILTER_CLOGGED, systems engine/fuel_filter_failure.rs) */
  fuelFilterClogged: boolean;
}

/**
 * ENG 1(2) FUEL FILTER CLOG of one engine.
 *
 * Design choice: monitored while the engine runs with its ENG MASTER ON, as ENG 1(2) OIL FILTER CLOG
 * (EngineOilAlerts): no such condition is documented, but a clogged filter only shows a pressure loss while the fuel
 * flows through it.
 */
export function engineFuelFilterClog(inputs: EngineFuelFilterInputs): boolean {
  return inputs.masterOn && inputs.engineRunning && inputs.fuelFilterClogged;
}
