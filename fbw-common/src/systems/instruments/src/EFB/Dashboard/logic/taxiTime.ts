// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Over a whole route the aircraft is slower than the 20 to 30 kt it holds on a straight: turns are flown at about
 * 10 kt and every hold short and crossing adds a stop, so the route average sits near the turn speed.
 */
export const AVG_TAXI_SPEED_KT = 10;

const METRES_PER_NM = 1852;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;

/** The measured route wins; the SimBrief taxi time is the stand-in, shown as planned */
export const taxiMinutes = (
  routeLengthM: number | null,
  fallbackSeconds: number | null,
): { minutes: number; planned: boolean } | null => {
  if (routeLengthM !== null && routeLengthM > 0) {
    const hours = routeLengthM / METRES_PER_NM / AVG_TAXI_SPEED_KT;
    return { minutes: Math.max(1, Math.round(hours * MINUTES_PER_HOUR)), planned: false };
  }
  if (fallbackSeconds !== null && fallbackSeconds > 0) {
    return { minutes: Math.max(1, Math.round(fallbackSeconds / SECONDS_PER_MINUTE)), planned: true };
  }
  return null;
};
