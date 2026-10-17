// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * SD ELEC page IDG indications:
 * - IDG legend: white, amber with the oil outlet above 180 °C, a low oil pressure, or the IDG disconnected.
 * - DISC in amber with the IDG disconnected; LO PR in amber with a low IDG oil pressure and the engine running.
 * - Oil outlet temperature: green, flashing between 147 °C and 180 °C (advisory), amber above 180 °C.
 */

const IDG_OIL_ADVISORY_CELSIUS = 147;
export const IDG_OIL_OVERHEAT_CELSIUS = 180;

export type IdgTemperatureState = 'normal' | 'advisory' | 'overheat';

export function idgTemperatureState(temperatureCelsius: number): IdgTemperatureState {
  if (temperatureCelsius > IDG_OIL_OVERHEAT_CELSIUS) {
    return 'overheat';
  }
  if (temperatureCelsius > IDG_OIL_ADVISORY_CELSIUS) {
    return 'advisory';
  }
  return 'normal';
}

/** The class of the temperature value: green, flashing green (advisory) or amber */
export function idgTemperatureClass(temperatureCelsius: number): string {
  switch (idgTemperatureState(temperatureCelsius)) {
    case 'overheat':
      return 'Amber';
    case 'advisory':
      return 'Green Pulse';
    default:
      return 'Green';
  }
}

/**
 * The IDG 1(2) legend is amber.
 * @param lowPressure the IDG low oil pressure signal of the GCU (L:A32NX_ELEC_ENG_GEN_n_IDG_OIL_LOW_PRESSURE), already
 * inhibited below N2 14 %: the engine runs.
 */
export function idgLegendAmber(connected: boolean, temperatureCelsius: number, lowPressure: boolean): boolean {
  return !connected || lowPressure || idgTemperatureState(temperatureCelsius) === 'overheat';
}

/** The amber DISC or LO PR legend below the IDG legend, DISC first */
export function idgStatusLegend(connected: boolean, lowPressure: boolean): 'DISC' | 'LO PR' | null {
  if (!connected) {
    return 'DISC';
  }
  return lowPressure ? 'LO PR' : null;
}
