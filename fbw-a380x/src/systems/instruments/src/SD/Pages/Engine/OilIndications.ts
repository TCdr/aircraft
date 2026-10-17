// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AutoThrustMode } from '@shared/autopilot';

/*
 * The oil indications of the ENGINE SD page.
 */

/** The oil advisory limit, the first white dash of the oil quantity gauge */
export const OIL_QTY_ADVISORY_QT = 1.2;

/** Above this the oil temperature pulses green */
const OIL_TEMP_PULSE_CELSIUS = 163;

/** Above this the oil temperature is amber */
export const OIL_TEMP_AMBER_CELSIUS = 177;

/** At or below this the oil pressure is red */
export const OIL_PSI_RED_MAX = 25;

/** The gauge units of the oil pressure scale: 0 to 500, its middle at 250 */
export const OIL_PSI_GAUGE_MAX = 500;

/**
 * The scale is not linear: 0 to 100 PSI on its first half, 100 to 440 PSI on its second half.
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
 * The A/THR modes of a takeoff or a go-around (TOGA, FLEX, derated takeoff, soft go-around) and of the alpha floor
 * protection (A.FLOOR, then TOGA LK), L:A32NX_AUTOTHRUST_MODE
 */
const OIL_ADVISORY_INHIBITING_ATHR_MODES: readonly number[] = [
  AutoThrustMode.MAN_TOGA,
  AutoThrustMode.MAN_GA_SOFT,
  AutoThrustMode.MAN_FLEX,
  AutoThrustMode.MAN_DTO,
  AutoThrustMode.A_FLOOR,
  AutoThrustMode.TOGA_LK,
];

/**
 * The oil quantity pulses below the 1.2 qt advisory. The advisory is inhibited at takeoff or go-around, with the thrust
 * reversers selected, or with the alpha floor protection active.
 * Design choices: takeoff or go-around is the thrust lever of the engine at TOGA or a takeoff / go-around A/THR mode
 * (FLEX and derated takeoffs included), alpha floor is the A.FLOOR / TOGA LK A/THR mode. No hysteresis is given: the
 * pulsing stops at 1.2 qt.
 * @param thrustLeverAngle L:A32NX_AUTOTHRUST_TLA:n in degrees: 45 at TOGA, negative in reverse
 * @param autothrustMode L:A32NX_AUTOTHRUST_MODE (AutoThrustMode)
 */
export function oilQuantityPulses(quantityQt: number, thrustLeverAngle: number, autothrustMode: number): boolean {
  const inhibited =
    thrustLeverAngle >= 45 || thrustLeverAngle < 0 || OIL_ADVISORY_INHIBITING_ATHR_MODES.indexOf(autothrustMode) !== -1;
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
 * The CLOGGED indication below the oil pressure: the oil filter is clogged, with the ENG OIL FILTER CLOGGED alert.
 * Design choice: shown while the engine runs, the oil flowing through the filter.
 * @param clogged the oil filter clog failure (L:A32NX_ENGINE_n_OIL_FILTER_CLOGGED)
 * @param engineState L:A32NX_ENGINE_STATE:n, 1 = running
 */
export function oilFilterCloggedShown(clogged: boolean, engineState: number): boolean {
  return clogged && engineState === 1;
}
