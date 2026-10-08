// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FadecEngineState } from './EngineFailAlerts';

/*
 * A380X FWS engine oil alerts (A380 FCOM PRO-ABN-ECAM-10-70, a380_fcom.txt): ENG 1(2)(3)(4) OIL FILTER CLOGGED
 * (l.172407-172442), OIL PRESS LO (l.172478-172516) and OIL TEMP HI (l.172553-172592). Their alert levels and flight
 * phase inhibitions are images, read on the FCOM PDF pages 5796-5800:
 * - OIL PRESS LO: red warning (MASTER WARN, CRC), inhibited in phases 1, 5, 6 and 12;
 * - OIL TEMP HI: amber caution (MASTER CAUT, SC), inhibited in phases 1, 4, 5, 6, 7, 9, 10 and 12;
 * - OIL FILTER CLOGGED: amber caution, inhibited in phases 3 to 10 (shown in phases 1, 2, 11 and 12 only).
 * Pure logic, used by FwsCore for the four engines alike.
 */

/** l.172486: "This warning is displayed when the oil pressure drops below 25 PSI." */
export const OIL_PRESS_LO_THRESHOLD_PSI = 25;

/** l.172561: "The oil temperature is above 196 °C." */
export const OIL_TEMP_HI_THRESHOLD_CELSIUS = 196;

export const OIL_PRESS_LO_PHASE_INHIBITION = [1, 5, 6, 12];
export const OIL_TEMP_HI_PHASE_INHIBITION = [1, 4, 5, 6, 7, 9, 10, 12];
export const OIL_FILTER_CLOGGED_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9, 10];

export interface EngineOilInputs {
  masterOn: boolean;
  engineState: FadecEngineState;
  oilPressurePsi: number;
  oilTemperatureCelsius: number;
  /** The oil filter clog failure (L:A32NX_ENGINE_n_OIL_FILTER_CLOGGED, systems engine/oil_failure.rs) */
  oilFilterClogged: boolean;
}

/** The oil alerts of one engine */
export interface EngineOilAlerts {
  pressureLow: boolean;
  temperatureHigh: boolean;
  filterClogged: boolean;
}

/**
 * The oil alerts of one engine.
 *
 * Design choice: the alerts are monitored while the engine runs (FADEC state ON) with its ENG MASTER ON. The FCOM gives
 * no such condition, but a stopped engine has no oil pressure, and the OIL PRESS LO and OIL TEMP HI procedures end with
 * the ENG MASTER OFF, after which ENG SHUT DOWN takes over (l.172515, "ENG 1(2)(3)(4) SHUT DOWN apply"). A clogged oil
 * filter only shows a pressure loss while the oil flows, with the engine running.
 */
export function engineOilAlerts(inputs: EngineOilInputs): EngineOilAlerts {
  const monitored = inputs.masterOn && inputs.engineState === FadecEngineState.On;
  return {
    pressureLow: monitored && inputs.oilPressurePsi < OIL_PRESS_LO_THRESHOLD_PSI,
    temperatureHigh: monitored && inputs.oilTemperatureCelsius > OIL_TEMP_HI_THRESHOLD_CELSIUS,
    filterClogged: monitored && inputs.oilFilterClogged,
  };
}
