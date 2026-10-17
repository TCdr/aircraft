// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** What decides whether the ENG SD page shows the parameters of an engine (or XX) */
export interface EngineParametersInputs {
  ignition: boolean;
  anyEngineRunning: boolean;
  /**
   * The aircraft electrical network supplies the FADEC: 15 min at power-up, 10 min after the FADEC GND PWR pb
   * (FadecGroundPower)
   */
  fadecSuppliedByAircraftNetwork: boolean;
  engineFirePbReleased: boolean;
  /**
   * The FADEC cannot communicate via the avionics networks (L:A32NX_ENGINE_n_FADEC_FAULT, flyPad "Engine n FADEC
   * network link")
   */
  fadecNetworkLost: boolean;
}

/**
 * Whether the ENG SD page shows the parameters of the engine. With an ENG FADEC FAULT the FADEC still controls the
 * engine and sends the primary parameters to the EWD, but the ENG SD page loses that engine's parameters.
 */
export function areEngineParametersShown(inputs: EngineParametersInputs): boolean {
  const fadecPowered =
    (inputs.ignition || inputs.anyEngineRunning || inputs.fadecSuppliedByAircraftNetwork) &&
    !inputs.engineFirePbReleased;
  return fadecPowered && !inputs.fadecNetworkLost;
}
