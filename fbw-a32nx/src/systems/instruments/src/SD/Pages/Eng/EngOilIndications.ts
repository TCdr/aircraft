// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The oil indications of the ENGINE SD page. The published limits are the CFM56-5B ones; FBW models the LEAP-1A, whose
 * limits are not published. The CFM56-5B limits are used where they fit the FBW oil model (EngineControlA32NX
 * updateOil), see the design choices below.
 */

/** The oil quantity scale goes from 0 to 22 QT */
export const OIL_QTY_SCALE_MAX_QT = 22;

/** The oil quantity advisory limit, at the amber mark */
export const OIL_QTY_ADVISORY_QT = 3;

/** The oil quantity pulses below 3.25 QT and keeps pulsing until 4.75 QT */
const OIL_QTY_PULSE_START_QT = 3.25;
const OIL_QTY_PULSE_STOP_QT = 4.75;

/** The red range of the oil pressure, 0 to 13 PSI (the ENG OIL LO PR warning threshold) */
export const OIL_PSI_RED_MAX = 13;

/**
 * The oil pressure pulses between the red range and the 16 PSI advisory limit with N2 above 75 %. Design choice: the
 * pulsing stops when the pressure goes back above 20 PSI (a hysteresis above the 16 PSI advisory).
 */
const OIL_PSI_LOW_ADVISORY = 16;
const OIL_PSI_LOW_ADVISORY_RESET = 20;
const OIL_PSI_LOW_ADVISORY_MIN_N2 = 75;

/**
 * Design choice: the upper oil pressure advisory stays the FBW one (scale 130 PSI, pulses from 129 PSI, stops below 126
 * PSI). The published 0-100 PSI scale with its 90 PSI advisory is the CFM56 one: the FBW oil pressure of the LEAP-1A
 * reaches about 90 PSI at take-off thrust, so the CFM56 advisory would pulse at every take-off.
 */
export const OIL_PSI_SCALE_MAX = 130;
const OIL_PSI_HIGH_ADVISORY = 129;
const OIL_PSI_HIGH_ADVISORY_RESET = 126;

export function oilQuantityPulses(wasPulsing: boolean, quantityQt: number): boolean {
  if (quantityQt < OIL_QTY_PULSE_START_QT) {
    return true;
  }
  if (quantityQt >= OIL_QTY_PULSE_STOP_QT) {
    return false;
  }
  return wasPulsing;
}

export function oilPressureIsRed(pressurePsi: number): boolean {
  return pressurePsi < OIL_PSI_RED_MAX;
}

/** The oil pressure pulses between the red range and 16 PSI with N2 above 75 %, or at the upper advisory */
export function oilPressurePulses(wasPulsing: boolean, pressurePsi: number, n2Percent: number): boolean {
  if (oilPressureIsRed(pressurePsi)) {
    return false;
  }
  const lowAdvisory =
    n2Percent > OIL_PSI_LOW_ADVISORY_MIN_N2 &&
    (pressurePsi < OIL_PSI_LOW_ADVISORY || (wasPulsing && pressurePsi <= OIL_PSI_LOW_ADVISORY_RESET));
  const highAdvisory =
    pressurePsi >= OIL_PSI_HIGH_ADVISORY || (wasPulsing && pressurePsi >= OIL_PSI_HIGH_ADVISORY_RESET);
  return lowAdvisory || highAdvisory;
}

/**
 * The oil filter CLOG indication: the pressure loss across the oil filter is excessive.
 * Design choice: as the ENG OIL FILTER CLOG alert (systems-host FWC/Logic/EngineOilAlerts), it shows while the engine
 * runs, the oil flowing through the filter.
 * @param clogged the oil filter clog failure (L:A32NX_ENGINE_n_OIL_FILTER_CLOGGED)
 * @param engineState L:A32NX_ENGINE_STATE:n, 1 = running
 */
export function oilFilterClogShown(clogged: boolean, engineState: number): boolean {
  return clogged && engineState === 1;
}

/**
 * Oil temperature: pulses green between 140 °C and 155 °C for less than 15 min, amber between 140 °C and 155 °C for
 * more than 15 min or above 155 °C. Same thresholds as the FWC ENG OIL HI TEMP alert (systems-host
 * FWC/Logic/EngineOilAlerts), so that the SD value turns amber with the alert.
 */
const OIL_TEMP_ADVISORY_CELSIUS = 140;
const OIL_TEMP_LIMIT_CELSIUS = 155;
const OIL_TEMP_ADVISORY_MAX_SECONDS = 15 * 60;
/** Design choice (not a published limit): amber below 38 °C */
const OIL_TEMP_LOW_CELSIUS = 38;

/**
 * The time spent at or above the 140 °C advisory, for the "more than 15 min" rule; it restarts below 140 °C.
 * It must run on every update, not only on a temperature change.
 * @param previousSeconds the time at the previous update, s
 * @param temperatureCelsius the oil temperature, °C
 * @param deltaSeconds the time since the previous update, s
 * @returns the time at or above the advisory, s
 */
export function oilTemperatureAdvisorySeconds(
  previousSeconds: number,
  temperatureCelsius: number,
  deltaSeconds: number,
): number {
  return temperatureCelsius >= OIL_TEMP_ADVISORY_CELSIUS ? previousSeconds + deltaSeconds : 0;
}

/**
 * Whether the oil temperature has been at or above 140 °C for more than 15 min.
 * @param advisorySeconds the time at or above the advisory (see oilTemperatureAdvisorySeconds), s
 * @returns true after more than 15 min
 */
export function oilTemperatureAdvisoryTimeExceeded(advisorySeconds: number): boolean {
  return advisorySeconds > OIL_TEMP_ADVISORY_MAX_SECONDS;
}

/**
 * The CSS class of the oil temperature value.
 * @param displayedTemperatureCelsius the displayed temperature (5 °C steps)
 * @param temperatureCelsius the oil temperature, °C
 * @param advisoryTimeExceeded more than 15 min at or above the advisory (see oilTemperatureAdvisoryTimeExceeded)
 * @returns FillAmber, FillPulse or FillGreen
 */
export function oilTemperatureClassName(
  displayedTemperatureCelsius: number,
  temperatureCelsius: number,
  advisoryTimeExceeded: boolean,
): string {
  if (
    temperatureCelsius > OIL_TEMP_LIMIT_CELSIUS ||
    displayedTemperatureCelsius > OIL_TEMP_LIMIT_CELSIUS ||
    advisoryTimeExceeded ||
    temperatureCelsius < OIL_TEMP_LOW_CELSIUS
  ) {
    return 'FillAmber';
  }
  return displayedTemperatureCelsius >= OIL_TEMP_ADVISORY_CELSIUS ? 'FillPulse' : 'FillGreen';
}
