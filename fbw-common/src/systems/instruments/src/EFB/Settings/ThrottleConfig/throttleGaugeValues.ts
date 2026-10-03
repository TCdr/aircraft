// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Where a throttle mapping value sits on the vertical gauge of the calibration page, in percent from the bottom.
 * The mapping values run from -1 (reverse full, bottom) to +1 (TOGA, top); out of range values stay on the gauge.
 */
export function throttleGaugePercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, ((value + 1) / 2) * 100));
}

/**
 * Whether the throttle lever is inside the range of the detent being calibrated: the gauge then shows the detent's
 * bounds in the active colour. The bounds are compared as they are displayed (2 decimals) and the lever position to
 * 2 significant digits, as the calibration page always did; a lever at exactly 0.00 or a bound at -1.00 counts too
 * (the former check treated these zero values as missing).
 */
export function isThrottleInDetent(position: number, lowerBound: number, upperBound: number): boolean {
  if (!Number.isFinite(position) || !Number.isFinite(lowerBound) || !Number.isFinite(upperBound)) {
    return false;
  }
  const roundedPosition = parseFloat(position.toPrecision(2));
  return roundedPosition >= parseFloat(lowerBound.toFixed(2)) && roundedPosition <= parseFloat(upperBound.toFixed(2));
}
