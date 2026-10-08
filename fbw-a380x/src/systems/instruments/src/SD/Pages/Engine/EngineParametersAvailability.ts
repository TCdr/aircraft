// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** What decides whether the ENG SD page shows the parameters of an engine (or XX) */
export interface EngineParametersInputs {
  ignition: boolean;
  anyEngineRunning: boolean;
  fadecManuallyPowered: boolean;
  engineFirePbReleased: boolean;
  /**
   * The FADEC cannot communicate via the avionics networks (L:A32NX_ENGINE_n_FADEC_FAULT, flyPad "Engine n FADEC
   * network link")
   */
  fadecNetworkLost: boolean;
}

/**
 * Whether the ENG SD page shows the parameters of the engine. A380 FCOM ENG 1(2)(3)(4) FADEC FAULT (a380_fcom.txt
 * l.171562-171564): "The FADEC can still provide engine control, and transmits to the EWD the primary engine parameters
 * ... The ENG 1(2)(3)(4) parameters on the ENG SD page are lost."
 */
export function areEngineParametersShown(inputs: EngineParametersInputs): boolean {
  const fadecPowered =
    (inputs.ignition || inputs.anyEngineRunning || inputs.fadecManuallyPowered) && !inputs.engineFirePbReleased;
  return fadecPowered && !inputs.fadecNetworkLost;
}
