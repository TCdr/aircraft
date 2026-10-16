// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * SD ELEC page IDG indications (A320 FCOM DSC-24-20, a320_fcom.txt l.37610-37625):
 * - (A) IDG legend: "normally white, but becomes amber, if: Oil outlet temperature > 180 °C. Oil pressure gets too low.
 *   IDG becomes disconnected."
 * - (B) DISC/LO PR: "The DISC legend appears in amber, when the IDG is disconnected. LO PR appears in amber, when IDG
 *   low pressure is detected and the associated engine is running."
 * - (C) Oil outlet temperature: "normally in green, but appears amber, if T > 180 °C. It flashes, if 147 °C < T < 180 °C
 *   (advisory)."
 */

export const IDG_OIL_ADVISORY_CELSIUS = 147;
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

/**
 * The RISE value (FCOM DSC-24-20 (13), a320_fcom.txt l.37650-37652): "This number, displayed in green, is the difference
 * between the temperature at the IDG inlet and that at the IDG outlet."
 * @param outletCelsius L:A32NX_ELEC_ENG_GEN_n_IDG_OIL_OUTLET_TEMPERATURE
 * @param inletCelsius L:A32NX_ELEC_ENG_GEN_n_IDG_OIL_INLET_TEMPERATURE
 * @returns the displayed rise, whole °C
 */
export function idgTemperatureRise(outletCelsius: number, inletCelsius: number): number {
  return Math.round(outletCelsius - inletCelsius);
}

/** The amber DISC or LO PR legend below the IDG legend, DISC first */
export function idgStatusLegend(connected: boolean, lowPressure: boolean): 'DISC' | 'LO PR' | null {
  if (!connected) {
    return 'DISC';
  }
  return lowPressure ? 'LO PR' : null;
}
