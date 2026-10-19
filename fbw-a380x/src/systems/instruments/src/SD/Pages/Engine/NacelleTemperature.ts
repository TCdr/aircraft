// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** Above the nacelle temperature advisory limit (the white dash of the gauge) the needle pulses */
export const NACELLE_TEMPERATURE_ADVISORY_CELSIUS = 300;

/**
 * @param celsius the nacelle temperature (L:A32NX_ENGINE_n_NACELLE_TEMPERATURE, a380_systems
 *   engine_nacelle_temperature.rs)
 * @returns whether the needle pulses
 */
export function nacelleTemperaturePulses(celsius: number): boolean {
  return celsius > NACELLE_TEMPERATURE_ADVISORY_CELSIUS;
}
