// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * ENG 1(2) FUEL FILTER CLOG (A320 FCOM PRO-ABN-ENG, a320_fcom.txt l.80166-80185). l.80176: "This alert triggers when the
 * fuel filter is clogged."; l.80182-80185: "Crew awareness. Maintenance action is due. The fuel filter is bypassed and
 * short term engine operation is not affected." The title colour and the flight phase inhibition figure are images,
 * read on the 2019 FCOM PDF page 2272: an amber caution inhibited in phases 3, 4, 5, 7 and 8. No procedure line.
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
 * (EngineOilAlerts): the FCOM gives no such condition, but a clogged filter only shows a pressure loss while the fuel
 * flows through it.
 */
export function engineFuelFilterClog(inputs: EngineFuelFilterInputs): boolean {
  return inputs.masterOn && inputs.engineRunning && inputs.fuelFilterClogged;
}
