// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

/** Which aircraft rule sets the default alternate cruise flight level */
export type AlternateCruiseLevelRule = 'A320' | 'A380';

/**
 * The default alternate cruise flight level for an alternate flight plan distance.
 * A320: FL 100 below 100 NM, FL 220 between 100 and 200 NM, else FL 310.
 * A380: FL 220 below 200 NM, FL 310 from 200 NM.
 * @param distanceNm the distance from the destination to the alternate in nautical miles
 * @param rule which aircraft's rule to apply
 * @returns the cruise level in hundreds of feet
 */
export function alternateCruiseLevel(distanceNm: number, rule: AlternateCruiseLevelRule): number {
  if (rule === 'A380') {
    return distanceNm < 200 ? 220 : 310;
  }

  if (distanceNm > 200) {
    return 310;
  }

  return distanceNm > 100 ? 220 : 100;
}

/**
 * Whether CHECK ALTN WIND is raised when company winds are inserted: the uplinked alternate wind level differs from the
 * default alternate cruise level (both aircraft). The uplinked wind altitude is in feet, the default alternate cruise
 * level a flight level.
 * @param uplinkedAltitudeFt the altitude of the uplinked alternate wind, in feet, if any
 * @param defaultFlightLevel the default alternate cruise flight level, if any
 */
export function uplinkedAlternateWindLevelDiffers(
  uplinkedAltitudeFt: number | undefined,
  defaultFlightLevel: number | undefined,
): boolean {
  if (uplinkedAltitudeFt === undefined || defaultFlightLevel === undefined) {
    return false;
  }
  return Math.round(uplinkedAltitudeFt / 100) !== Math.round(defaultFlightLevel);
}
