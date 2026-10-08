// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FadecEngineState } from './EngineFailAlerts';

/*
 * ENG 1(2)(3)(4) FUEL FILTER CLOGGED (A380 FCOM PRO-ABN-ECAM-10-70, a380_fcom.txt l.171982-172004). l.171988-171991:
 * "The fuel filter is clogged. The pressure drop across the fuel filter is higher than 35 PSI. When the pressure drop is
 * higher than 60 PSI, the bypass valve opens and the ENG FUEL SYS CONTAMINATION alert is triggered." Indication: ENGINE
 * SD page; crew awareness, no procedure line. The level and flight phase inhibition figure are images, read on the FCOM
 * PDF page 5783: an amber caution inhibited in phases 3 to 10 (shown in phases 1, 2, 11 and 12 only).
 * ENG FUEL SYS CONTAMINATION (above 60 PSI) is not modelled: the flyPad failure is a clogged filter only.
 */

export const FUEL_FILTER_CLOGGED_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9, 10];

export interface EngineFuelFilterInputs {
  masterOn: boolean;
  engineState: FadecEngineState;
  /** The fuel filter clog failure (L:A32NX_ENGINE_n_FUEL_FILTER_CLOGGED, systems engine/fuel_filter_failure.rs) */
  fuelFilterClogged: boolean;
}

/**
 * ENG 1(2)(3)(4) FUEL FILTER CLOGGED of one engine.
 *
 * Design choice: monitored while the engine runs (FADEC state ON) with its ENG MASTER ON, as ENG OIL FILTER CLOGGED
 * (EngineOilAlerts.ts): the FCOM gives no such condition, but a clogged filter only shows a pressure drop while the fuel
 * flows through it.
 */
export function engineFuelFilterClogged(inputs: EngineFuelFilterInputs): boolean {
  return inputs.masterOn && inputs.engineState === FadecEngineState.On && inputs.fuelFilterClogged;
}
