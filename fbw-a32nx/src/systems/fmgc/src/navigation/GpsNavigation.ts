// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The GPIRS data of one IR as the FMS reads it: null for a word that is not in normal operation */
export interface GpirsData {
  /** Whether the GPIRS position is valid (the IR in NAV with a GPS receiver in NAV) */
  positionValid: boolean;
  /** The 95 % accuracy of the position, in NM */
  figureOfMerit: number | null;
  /** The horizontal integrity limit (HIL), in NM */
  integrityLimit: number | null;
}

/** The order in which the FMS selects a GPIRS position: onside, IR 3, opposite (A320 FCOM DSC-22_20) */
export const GPIRS_SELECTION_ORDER = [1, 3, 2] as const;

/** The smallest estimated position uncertainty, in NM (the PROG page shows two decimals) */
export const MIN_ESTIMATED_POSITION_UNCERTAINTY = 0.01;

export interface GpsNavigationState {
  /** The IR whose GPIRS position is used, null when none is valid */
  source: number | null;
  /** The estimated position uncertainty in GPS mode, in NM; null without a GPIRS figure of merit */
  estimatedPositionUncertainty: number | null;
  /** Navigation accuracy HIGH: the uncertainty within the required navigation performance */
  accuracyHigh: boolean;
  /** GPS PRIMARY: GPS mode, accuracy HIGH and the integrity limit within the required navigation performance */
  gpsPrimary: boolean;
}

/**
 * The GPS navigation state of the FMS from the GPIRS data of the three IRs and the required navigation performance.
 *
 * A320 FCOM DSC-22_20: the FMS selects one GPIRS position (onside, GPIRS 3, opposite) and rejects the GPS mode when the
 * GPIRS data does not comply with the integrity criterion based on the Horizontal Integrity Limit. A380 FCOM
 * DSC-22-FMS-10-30-10: each FMS uses the onside GPIRS position, else GPIRS 3, else the offside one when the onside one is
 * "not valid or integer"; the GPIRS position accuracy is its HFOM; GPS PRIMARY when the navigation mode is IRS/GPS and
 * the navigation accuracy is HIGH.
 *
 * The flight crew can deselect the GPS (A320 MCDU SELECTED NAVAIDS page, A380 MFD POSITION/NAVAIDS page): the GPIRS
 * position is then no longer used to compute the FMS position (A380 FCOM DSC-22-FMS-10-30-10).
 * @param gpirs the GPIRS data of IR 1, 2 and 3 (index 0, 1, 2)
 * @param requiredNavigationPerformance the active RNP, in NM
 * @param gpsDeselected whether the flight crew has deselected the GPS
 */
export function gpsNavigationState(
  gpirs: readonly [GpirsData, GpirsData, GpirsData],
  requiredNavigationPerformance: number,
  gpsDeselected = false,
): GpsNavigationState {
  const source = gpsDeselected ? null : GPIRS_SELECTION_ORDER.find((ir) => gpirs[ir - 1].positionValid) ?? null;
  if (source === null) {
    return { source, estimatedPositionUncertainty: null, accuracyHigh: false, gpsPrimary: false };
  }
  const { figureOfMerit, integrityLimit } = gpirs[source - 1];
  const estimatedPositionUncertainty =
    figureOfMerit !== null ? Math.max(figureOfMerit, MIN_ESTIMATED_POSITION_UNCERTAINTY) : null;
  const accuracyHigh =
    estimatedPositionUncertainty !== null && estimatedPositionUncertainty <= requiredNavigationPerformance;
  const gpsPrimary = accuracyHigh && integrityLimit !== null && integrityLimit <= requiredNavigationPerformance;
  return { source, estimatedPositionUncertainty, accuracyHigh, gpsPrimary };
}
