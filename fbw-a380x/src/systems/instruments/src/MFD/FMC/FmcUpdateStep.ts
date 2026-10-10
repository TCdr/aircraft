// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** Longest step given to dt-based FMC code after a pause or a sim-rate jump (ms) */
const MAX_FMC_STEP_MS = 1000;

/**
 * The time step of one FMC update on sim time. The FMC now updates at 5 Hz on sim time and starts with
 * lastUpdateTime = 0, so the first raw step is the whole sim time: it is ignored.
 * @param lastUpdateTimeMs sim time of the previous update (ms), 0 before the first update
 * @param nowMs sim time of this update (ms)
 * @returns the step (ms) for the dt-based FMC code (fuel planning, time keeper, sequenced waypoint recorder)
 */
export function clampFmcUpdateStep(lastUpdateTimeMs: number, nowMs: number): number {
  if (lastUpdateTimeMs <= 0) {
    return 0;
  }
  return Math.min(Math.max(nowMs - lastUpdateTimeMs, 0), MAX_FMC_STEP_MS);
}
