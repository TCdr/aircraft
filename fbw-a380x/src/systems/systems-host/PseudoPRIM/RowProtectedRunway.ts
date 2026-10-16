// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Which runway ROW/ROP protect during the ROW arming phase.
 * A380 FCOM DSC-32-10-30-20 ROW ARMING PHASE (a380_fcom.txt l.79512-79519):
 * - "ROW scans the landing runway between 500 ft and 300 ft, taking into account the aircraft position and the runway
 *   position. Even if the flight crew changes of landing runway between 500 ft and 300 ft, the new runway becomes the
 *   protected runway."
 * - "In BTV auto-brake mode, the runway detection is performed only at 300 ft. Between 500 ft and 300 ft, the protected
 *   runway is the runway selected by the flight crew for the landing in BTV auto-brake mode."
 */

/** The ROW arming phase: "between 500 ft and 300 ft" RA (l.79512) */
export const ROW_ARMING_UPPER_RA_FT = 500;
export const ROW_ARMING_LOWER_RA_FT = 300;

/**
 * In BTV, the detection "is performed only at 300 ft" (l.79516). Design choice: the detection runs at 5 Hz and stops
 * below 300 ft, so the detected runway is taken in the last 10 ft above 300 ft (a few updates at a normal descent rate).
 */
export const ROW_BTV_RUNWAY_DETECTION_RA_FT = 310;

/**
 * @param radioAltitudeFt the radio altitude, inside the arming phase (300 to 500 ft)
 * @param btvArmed the auto-brake is armed in BTV mode
 * @param protectedRunway the runway ROW/ROP currently protect (the BTV or FMS landing runway), null if none
 * @param detectedRunway the landing runway detected from the aircraft and runway positions
 * @returns the detected runway becomes the protected runway
 */
export function shouldProtectDetectedRunway(
  radioAltitudeFt: number,
  btvArmed: boolean,
  protectedRunway: string | null,
  detectedRunway: string,
): boolean {
  if (protectedRunway === detectedRunway) {
    return false;
  }
  if (!btvArmed || protectedRunway === null) {
    return true;
  }
  return radioAltitudeFt <= ROW_BTV_RUNWAY_DETECTION_RA_FT;
}
