// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Whether an airborne intruder inside the TCAS surveillance volume is shown on the ND, for the position of the TCAS
 * panel TRAFFIC selector:
 * - THRT: the proximate and other intruders are shown only while a TA or RA is present, within 2 700 ft above and
 *   below the aircraft. The TA and RA intruders themselves are always shown.
 * - ALL, ABV, BLW: all the intruders within the altitude band of the selector position are shown (full time).
 * @param isThreatPosition true with the TRAFFIC selector on THRT
 * @param relativeAlt intruder altitude minus own altitude, in ft
 * @param band [lowest, highest] relative altitude of the selector position, in ft
 * @param isAdvisoryIntruder the intruder itself is a TA or RA intruder
 * @param isAdvisoryPresent the TCAS has a TA or an RA (on any intruder)
 * @returns true when the intruder is shown
 */
export function isIntruderShownForTrafficSelector(
  isThreatPosition: boolean,
  relativeAlt: number,
  band: readonly [number, number],
  isAdvisoryIntruder: boolean,
  isAdvisoryPresent: boolean,
): boolean {
  const withinBand = relativeAlt >= band[0] && relativeAlt <= band[1];
  if (!withinBand) {
    return false;
  }
  return !isThreatPosition || isAdvisoryIntruder || isAdvisoryPresent;
}
