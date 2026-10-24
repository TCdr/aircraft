// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;

/**
 * Minutes until the planned T/D. The navlog counts from takeoff, so the planned time is the actual takeoff time plus
 * the navlog time: a late departure moves the T/D with it. Null before takeoff.
 */
export const plannedMinutesToTod = (
  takeoffSimMs: number | null,
  secondsAfterTakeoff: number | null,
  nowSimMs: number,
): number | null => {
  if (takeoffSimMs === null || secondsAfterTakeoff === null) {
    return null;
  }
  return Math.max(0, (takeoffSimMs + secondsAfterTakeoff * MS_PER_SECOND - nowSimMs) / MS_PER_MINUTE);
};
