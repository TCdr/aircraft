// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

/** Which FCOM rule sets the default alternate cruise flight level */
export type AlternateCruiseLevelRule = 'A320' | 'A380';

/**
 * The default alternate cruise flight level for an alternate flight plan distance.
 * A320 FCOM (a320_fcom.txt l.14309-14311): FL 100 below 100 NM, FL 220 between 100 and 200 NM, else FL 310.
 * A380 FCOM DSC-22-FMS-20-30 (a380_fcom.txt l.42387): FL 220 below 200 NM, FL 310 from 200 NM.
 * @param distanceNm the distance from the destination to the alternate in nautical miles
 * @param rule which aircraft's FCOM rule to apply
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
