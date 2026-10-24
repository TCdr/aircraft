// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

const A320_TOTAL_GALLONS = 6267;
const A320_CENTER_GALLONS = 2179;
const A320_WING_TOTAL_SECONDS = 1020;
const A320_CENTER_TOTAL_SECONDS = 1200;
const A380_FUEL_FLOW_GALLONS_PER_SECOND = 16;
const FAST_SPEED_FACTOR = 5;
/** Below this the page shows half a minute instead of rounding to zero */
const HALF_MINUTE_THRESHOLD_SECONDS = 35;

export interface RefuelTimeInput {
  /** The target is already reached or the rate setting is instant */
  instantOrAtTarget: boolean;
  fastRate: boolean;
}

const minutesFromSeconds = (seconds: number): number =>
  seconds < HALF_MINUTE_THRESHOLD_SECONDS ? 0.5 : Math.round(seconds / 60);

/** A320 refuel duration in minutes (0.5 for a short top-up), tanks filling in parallel */
export const a320RefuelMinutes = (
  i: RefuelTimeInput & { wingDifferenceGallons: number; centerDifferenceGallons: number },
): number => {
  if (i.instantOrAtTarget) {
    return 0;
  }
  const wingSeconds = (i.wingDifferenceGallons / (A320_TOTAL_GALLONS - A320_CENTER_GALLONS)) * A320_WING_TOTAL_SECONDS;
  const centerSeconds = (i.centerDifferenceGallons / A320_CENTER_GALLONS) * A320_CENTER_TOTAL_SECONDS;
  const seconds = Math.max(wingSeconds, centerSeconds);
  return minutesFromSeconds(i.fastRate ? seconds / FAST_SPEED_FACTOR : seconds);
};

/** A380 refuel duration in minutes (0.5 for a short top-up) */
export const a380RefuelMinutes = (i: RefuelTimeInput & { differenceGallons: number }): number => {
  if (i.instantOrAtTarget) {
    return 0;
  }
  const factor = i.fastRate ? FAST_SPEED_FACTOR : 1;
  return minutesFromSeconds(i.differenceGallons / (A380_FUEL_FLOW_GALLONS_PER_SECOND * factor));
};
