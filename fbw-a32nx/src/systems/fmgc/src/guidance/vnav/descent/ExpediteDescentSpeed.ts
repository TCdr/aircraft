// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

const EXPEDITE_DESCENT_SPEED: Knots = 340;
const EXPEDITE_DESCENT_MACH: Mach = 0.8;

/**
 * The managed speed target in EXP DES: 340 kt or M .80, whichever is lower. Speed constraints and the speed limit do
 * not apply in expedite.
 * @param casFromMach converts a Mach number to CAS at the present altitude
 */
export function expediteDescentSpeedTarget(casFromMach: (mach: Mach) => Knots): Knots {
  return Math.min(EXPEDITE_DESCENT_SPEED, casFromMach(EXPEDITE_DESCENT_MACH));
}
