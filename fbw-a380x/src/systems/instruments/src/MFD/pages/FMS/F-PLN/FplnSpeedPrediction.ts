// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The speed prediction of the F-PLN page: a CAS in knots, or a Mach as .NN */
export function formatSpeedPrediction(speed: number): string {
  return speed > 2 ? speed.toFixed(0) : `.${speed.toFixed(2).split('.')[1]}`;
}

/**
 * Whether a waypoint shows the ditto character instead of its speed prediction: its prediction shows the same value
 * as the waypoint just above. The shown values are compared, so that a speed which changes slowly from waypoint to
 * waypoint is not hidden behind ditto characters.
 */
export function isSameSpeedPrediction(speed: number, speedAbove: number): boolean {
  return formatSpeedPrediction(speed) === formatSpeedPrediction(speedAbove);
}
