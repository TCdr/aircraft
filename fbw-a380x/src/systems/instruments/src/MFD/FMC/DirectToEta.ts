// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** Below this ground speed (taxi) the DIR TO time of arrival is not estimated */
const MIN_GROUND_SPEED_KT = 30;

const SECONDS_PER_DAY = 86400;

/**
 * The UTC of arrival at the DIR TO target (FCOM DSC-31-20-30-90 P 12, DSC-22-FMS-20-30 DIRECT TO page). The FMS has no
 * predictions of the temporary flight plan, so the DIRECT TO pages of the MFD and the ND estimate it from the distance
 * and the current ground speed.
 * @param distanceNm the distance to the target, null when not computed
 * @param groundSpeedKt the ground speed
 * @param utcSeconds the current UTC, in seconds of the day
 * @returns the UTC of arrival in seconds of the day (whole minutes), or null when not estimated
 */
export function directToEtaSeconds(
  distanceNm: number | null,
  groundSpeedKt: number,
  utcSeconds: number,
): number | null {
  if (distanceNm === null || !Number.isFinite(distanceNm) || groundSpeedKt < MIN_GROUND_SPEED_KT) {
    return null;
  }
  const eta = (utcSeconds + (distanceNm / groundSpeedKt) * 3600) % SECONDS_PER_DAY;
  return Math.floor(eta / 60) * 60;
}

/** HH:MM of a UTC in seconds of the day, '--:--' when unknown */
export function formatUtc(utcSeconds: number | null): string {
  if (utcSeconds === null) {
    return '--:--';
  }
  const minutes = Math.floor(utcSeconds / 60) % (24 * 60);
  return `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
}
