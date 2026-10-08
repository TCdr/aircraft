// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The oil indications of the ENGINE SD page (A380 FCOM DSC-70-90 P 22-23/28, a380_fcom.txt l.113334-113390; the
 * figures of the FCOM PDF pages 4110-4111).
 */

/** l.113340-113343: the oil advisory limit "corresponds to the first white dash ... The oil advisory limit is 1.2 quarts." */
export const OIL_QTY_ADVISORY_QT = 1.2;

/** l.113362: "If the engine oil temperature is above 163 °C, the oil temperature indication pulses green." */
export const OIL_TEMP_PULSE_CELSIUS = 163;

/** l.113371: "If the engine oil temperature is above 177 °C, the oil temperature indication is amber." */
export const OIL_TEMP_AMBER_CELSIUS = 177;

/** l.113385: "If the engine oil pressure is equal to or below 25 PSI, the indication is red." */
export const OIL_PSI_RED_MAX = 25;

/** The gauge units of the oil pressure scale: 0 to 500, its middle at 250 */
export const OIL_PSI_GAUGE_MAX = 500;

/**
 * l.113377-113382: "The scale is not linear: On the first half of the scale, the engine oil pressure range varies from
 * 0 PSI to 100 PSI. On the second half of the scale, the engine oil pressure range varies from 100 PSI to 440 PSI."
 * @returns the position of a pressure on the 0-500 gauge
 */
export function oilPressureGaugeValue(pressurePsi: number): number {
  const pressure = Math.max(0, pressurePsi);
  const half = OIL_PSI_GAUGE_MAX / 2;
  if (pressure <= 100) {
    return (half * pressure) / 100;
  }
  return Math.min(OIL_PSI_GAUGE_MAX, half + (half * (pressure - 100)) / 340);
}

export function oilPressureIsRed(pressurePsi: number): boolean {
  return pressurePsi <= OIL_PSI_RED_MAX;
}

/**
 * The oil quantity pulses below the 1.2 qt advisory (l.113339-113349). "The advisory is inhibited: At takeoff or
 * go-around, or When the thrust reversers are selected, or When the alpha floor protection is active."
 * Design choice: takeoff or go-around is the thrust lever of the engine at TOGA, and alpha floor is not modelled (it only
 * comes with the levers at idle to CLB, in flight). No hysteresis is given: the pulsing stops at 1.2 qt.
 * @param thrustLeverAngle L:A32NX_AUTOTHRUST_TLA:n in degrees: 45 at TOGA, negative in reverse
 */
export function oilQuantityPulses(quantityQt: number, thrustLeverAngle: number): boolean {
  const inhibited = thrustLeverAngle >= 45 || thrustLeverAngle < 0;
  return !inhibited && quantityQt < OIL_QTY_ADVISORY_QT;
}

/** The oil temperature: green, pulsing above 163 °C, amber above 177 °C */
export function oilTemperatureClass(temperatureCelsius: number): 'Green' | 'FillPulse' | 'Amber' {
  if (temperatureCelsius > OIL_TEMP_AMBER_CELSIUS) {
    return 'Amber';
  }
  if (temperatureCelsius > OIL_TEMP_PULSE_CELSIUS) {
    return 'FillPulse';
  }
  return 'Green';
}

/**
 * The CLOGGED indication below the oil pressure (l.113388-113390: "The engine oil filter is clogged. Associated with the
 * ECAM alert ENG 1(2)(3)(4) OIL FILTER CLOGGED"). Design choice: shown while the engine runs, the oil flowing through
 * the filter.
 * @param clogged the oil filter clog failure (L:A32NX_ENGINE_n_OIL_FILTER_CLOGGED)
 * @param engineState L:A32NX_ENGINE_STATE:n, 1 = running
 */
export function oilFilterCloggedShown(clogged: boolean, engineState: number): boolean {
  return clogged && engineState === 1;
}
