// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The oil indications of the ENGINE SD page (A320 FCOM DSC-70-90-40, a320_fcom.txt l.64503-64571). This FCOM is the
 * CFM56-5B one; FBW models the LEAP-1A, whose numbers no FCOM on hand gives. The FCOM numbers are used where they fit the
 * FBW oil model (EngineControlA32NX updateOil), see the design choices below.
 */

/** l.64508: "The scale goes from 0 to 22 QT." */
export const OIL_QTY_SCALE_MAX_QT = 22;

/** l.64510-64511: "The oil quantity goes below the oil advisory limit (3 QT), that corresponds to the amber mark." */
export const OIL_QTY_ADVISORY_QT = 3;

/** l.64513-64514: "The indication pulses, when oil quantity goes below 3.25 QT, and remains pulsing as long as oil quantity is below 4.75 QT." */
export const OIL_QTY_PULSE_START_QT = 3.25;
export const OIL_QTY_PULSE_STOP_QT = 4.75;

/** l.64540: "The red range is between 0 and 13 PSI." (the ENG OIL LO PR warning threshold, l.80569) */
export const OIL_PSI_RED_MAX = 13;

/**
 * l.64533-64537: the oil pressure pulses "Between the upper red threshold and the lower advisory limit, when N2 is above
 * 75 %. The advisory limit is 16 PSI. The oil pressure stops pulsing, when oil pressure goes below 20 PSI." Design choice:
 * the pulsing stops when the pressure goes back above 20 PSI (a hysteresis above the 16 PSI advisory).
 */
export const OIL_PSI_LOW_ADVISORY = 16;
export const OIL_PSI_LOW_ADVISORY_RESET = 20;
export const OIL_PSI_LOW_ADVISORY_MIN_N2 = 75;

/**
 * Design choice: the upper oil pressure advisory stays the FBW one (scale 130 PSI, pulses from 129 PSI, stops below
 * 126 PSI). The FCOM 0-100 PSI scale with its 90 PSI advisory (l.64523-64528) is the CFM56 one: the FBW oil pressure of
 * the LEAP-1A reaches about 90 PSI at take-off thrust, so the CFM56 advisory would pulse at every take-off.
 */
export const OIL_PSI_SCALE_MAX = 130;
export const OIL_PSI_HIGH_ADVISORY = 129;
export const OIL_PSI_HIGH_ADVISORY_RESET = 126;

/** The oil quantity pulses below 3.25 QT and until it is back at 4.75 QT */
export function oilQuantityPulses(wasPulsing: boolean, quantityQt: number): boolean {
  if (quantityQt < OIL_QTY_PULSE_START_QT) {
    return true;
  }
  if (quantityQt >= OIL_QTY_PULSE_STOP_QT) {
    return false;
  }
  return wasPulsing;
}

/** The oil pressure is red from 0 to 13 PSI */
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
 * The oil filter CLOG indication (l.64569-64571: "Indicates that the pressure loss across the oil filter is excessive.").
 * Design choice: as the ENG OIL FILTER CLOG alert (systems-host FWC/Logic/EngineOilAlerts), it shows while the engine
 * runs, the oil flowing through the filter.
 * @param clogged the oil filter clog failure (L:A32NX_ENGINE_n_OIL_FILTER_CLOGGED)
 * @param engineState L:A32NX_ENGINE_STATE:n, 1 = running
 */
export function oilFilterClogShown(clogged: boolean, engineState: number): boolean {
  return clogged && engineState === 1;
}
