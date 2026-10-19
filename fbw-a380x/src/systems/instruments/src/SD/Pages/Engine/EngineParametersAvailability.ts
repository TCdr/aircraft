// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** What decides whether the ENG SD page shows the parameters of an engine (or XX) */
export interface EngineParametersInputs {
  /**
   * A channel of the FADEC is powered and works (L:A32NX_FADEC_POWERED_ENGn, a380_systems fadec_power.rs): the FADEC
   * alternator above 12.5 % N3, else the aircraft network that the EIPM switches to it (ground timers of
   * FadecGroundPower, engine start, in flight, ENG FIRE pb not released)
   */
  fadecPowered: boolean;
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
  return inputs.fadecPowered && !inputs.fadecNetworkLost;
}

/**
 * Whether the ENG SD page shows the rotor vibrations of the engine: the engine monitoring unit (EMU) that measures them
 * has its own supply (L:A32NX_ENGINE_n_EMU_SUPPLIED, AC 4 for engines 1 and 3, AC 2 for engines 2 and 4).
 */
export function areVibrationsShown(engineParametersShown: boolean, emuSupplied: boolean): boolean {
  return engineParametersShown && emuSupplied;
}
