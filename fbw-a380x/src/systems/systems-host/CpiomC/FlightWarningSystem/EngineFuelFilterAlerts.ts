// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FadecEngineState } from './EngineFailAlerts';

/*
 * ENG 1(2)(3)(4) FUEL FILTER CLOGGED: the pressure drop across the fuel filter is above 35 PSI. Crew awareness, no
 * procedure line: amber, inhibited in phases 3 to 10, with the ENGINE SD page as its only indication (no aural, no
 * MASTER CAUT).
 * Above 60 PSI the bypass valve opens and ENG FUEL SYS CONTAMINATION triggers; not modelled, as the flyPad failure is a
 * clogged filter only.
 */

/** FwsAbnormalSensed level 1: no single chime and no MASTER CAUT */
export const FUEL_FILTER_CLOGGED_LEVEL = 1;

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
 * (EngineOilAlerts.ts): no such condition is published, but a clogged filter only shows a pressure drop while the fuel
 * flows through it.
 */
export function engineFuelFilterClogged(inputs: EngineFuelFilterInputs): boolean {
  return inputs.masterOn && inputs.engineState === FadecEngineState.On && inputs.fuelFilterClogged;
}
