// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** Above this nacelle temperature (L:A32NX_ENGINE_n_NACELLE_TEMPERATURE, systems nacelle_temperature.rs) the value pulses */
export const NACELLE_TEMPERATURE_ADVISORY_CELSIUS = 240;

/** L:A32NX_ENGINE_STATE of a starting (2) or restarting (3) engine */
const ENGINE_STATE_STARTING = 2;
const ENGINE_STATE_RESTARTING = 3;

/**
 * The NAC indication appears when the nacelle temperature of at least one engine goes above the advisory limit, unless
 * an engine is in its start sequence.
 *
 * @param nacelleTemperatures the nacelle temperature of each engine, in °C
 * @param engineStates the engine states (L:A32NX_ENGINE_STATE) of each engine
 */
export function nacelleTemperatureShown(nacelleTemperatures: number[], engineStates: number[]): boolean {
  const duringStart = engineStates.some(
    (state) => state === ENGINE_STATE_STARTING || state === ENGINE_STATE_RESTARTING,
  );
  return !duringStart && nacelleTemperatures.some((celsius) => celsius > NACELLE_TEMPERATURE_ADVISORY_CELSIUS);
}

/** Green while normal, pulsing green above the advisory limit */
export function nacelleTemperatureClassName(celsius: number): string {
  return celsius > NACELLE_TEMPERATURE_ADVISORY_CELSIUS ? 'FillPulse' : 'FillGreen';
}
