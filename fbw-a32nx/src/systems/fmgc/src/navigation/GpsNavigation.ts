// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { selectGpirs } from '@fmgc/navigation/FmPosition';

/** The GPIRS data of one IR as the FMS reads it: null for a word that is not in normal operation */
export interface GpirsData {
  /** Whether the GPIRS position is valid (the IR in NAV with a GPS receiver in NAV) */
  positionValid: boolean;
  /** The 95 % accuracy of the position, in NM */
  figureOfMerit: number | null;
  /** The horizontal integrity limit (HIL), in NM */
  integrityLimit: number | null;
}

/** The smallest estimated position uncertainty, in NM (the PROG page shows two decimals) */
const MIN_ESTIMATED_POSITION_UNCERTAINTY = 0.01;

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
 * The FMS selects one GPIRS position (onside, GPIRS 3, offside) and rejects the GPS mode when the GPIRS data fails the
 * integrity criterion of the Horizontal Integrity Limit. The accuracy of the GPIRS position is its HFOM. GPS PRIMARY
 * needs the IRS/GPS navigation mode and a HIGH navigation accuracy.
 *
 * The flight crew can deselect the GPS (A320 MCDU SELECTED NAVAIDS page, A380 MFD POSITION/NAVAIDS page): the GPIRS
 * position is then no longer used to compute the FMS position.
 * @param gpirs the GPIRS data of IR 1, 2 and 3 (index 0, 1, 2)
 * @param requiredNavigationPerformance the active RNP, in NM
 * @param gpsDeselected whether the flight crew has deselected the GPS
 */
export function gpsNavigationState(
  gpirs: readonly [GpirsData, GpirsData, GpirsData],
  requiredNavigationPerformance: number,
  gpsDeselected = false,
): GpsNavigationState {
  // The GPIRS selection order of FMS 1: onside, IR 3, opposite
  const source = gpsDeselected
    ? null
    : selectGpirs(
        1,
        gpirs.map((g) => g.positionValid),
      );
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
