// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Longest step given to the dt-based FMC code (ms). A jump protection only, after a pause or a sim time jump: the FMC
 * updates at 5 Hz real time, so a sim rate step must pass (16x sim rate: 200 ms real = 3.2 s sim).
 */
const MAX_FMC_STEP_MS = 5000;

/**
 * The time step of one FMC update on sim time. The FMC updates 5 times per real second, with the sim time step, and
 * starts with lastUpdateTime = 0, so the first raw step is the whole sim time: it is ignored.
 * @param lastUpdateTimeMs sim time of the previous update (ms), 0 before the first update
 * @param nowMs sim time of this update (ms)
 * @returns the step (ms) for the dt-based FMC code (guidance, flight phase, fuel planning, time keeper...)
 */
export function clampFmcUpdateStep(lastUpdateTimeMs: number, nowMs: number): number {
  if (lastUpdateTimeMs <= 0) {
    return 0;
  }
  return Math.min(Math.max(nowMs - lastUpdateTimeMs, 0), MAX_FMC_STEP_MS);
}
