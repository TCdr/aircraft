// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429WordData } from '@flybywiresim/fbw-sdk';

/*
 * NAV ALTI DISCREPANCY and the CHECK ALT message it sends to the PFDs (FWC discrete word 124 bits 24/25): the altitudes
 * displayed on the CAPT and F/O PFDs differ by more than 500 ft with the STD baro reference, or by more than 250 ft
 * with the QNH or QFE baro reference.
 */

/** With the QNH or QFE baro reference */
export const ALTI_DISCREPANCY_BARO_REFERENCE_FT = 250;

/** With the STD baro reference */
export const ALTI_DISCREPANCY_STD_REFERENCE_FT = 500;

/** A word the FWC compares: normal operation or functional test */
function isUsable(word: Arinc429WordData): boolean {
  return word.isNormalOperation() || word.isFunctionalTest();
}

/**
 * Whether the altitude one side's ADR sends and the altitude the other side's DMC displays disagree, in either
 * direction (CAPT ADR vs F/O DMC, F/O ADR vs CAPT DMC).
 * @param leftAdrAltitude the altitude of the ADR that supplies the CAPT side
 * @param rightDmcAltitude the altitude the F/O DMC displays
 * @param rightAdrAltitude the altitude of the ADR that supplies the F/O side
 * @param leftDmcAltitude the altitude the CAPT DMC displays
 * @param thresholdFt ALTI_DISCREPANCY_BARO_REFERENCE_FT or ALTI_DISCREPANCY_STD_REFERENCE_FT
 * @returns whether the difference is greater than the threshold
 */
export function isAltitudeDiscrepancy(
  leftAdrAltitude: Arinc429WordData,
  rightDmcAltitude: Arinc429WordData,
  rightAdrAltitude: Arinc429WordData,
  leftDmcAltitude: Arinc429WordData,
  thresholdFt: number,
): boolean {
  return (
    (isUsable(leftAdrAltitude) &&
      isUsable(rightDmcAltitude) &&
      Math.abs(leftAdrAltitude.value - rightDmcAltitude.value) > thresholdFt) ||
    (isUsable(rightAdrAltitude) &&
      isUsable(leftDmcAltitude) &&
      Math.abs(rightAdrAltitude.value - leftDmcAltitude.value) > thresholdFt)
  );
}
