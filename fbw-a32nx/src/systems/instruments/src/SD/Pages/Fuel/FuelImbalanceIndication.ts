// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Fuel quantity advisory: in flight phases 2 and 6, with more than 1 500 kg (3 300 lb) between the two wings, the inner
 * and outer tank quantities of the heavier wing pulse.
 */

/** The wing imbalance of the advisory, in kg */
const WING_IMBALANCE_ADVISORY_KG = 1_500;

/** The FWC flight phases of the advisory (2: first engine started, 6: airborne above 1 500 ft) */
const ADVISORY_FLIGHT_PHASES = [2, 6];

/** Which wing's inner and outer tank quantities pulse */
export interface WingImbalancePulse {
  left: boolean;
  right: boolean;
}

/**
 * @param leftWingKg fuel in the left inner and outer tanks, kg
 * @param rightWingKg fuel in the right inner and outer tanks, kg
 * @param fwcFlightPhase the FWC flight phase (L:A32NX_FWC_FLIGHT_PHASE)
 * @returns which wing pulses: the heavier one, only with the advisory
 */
export function wingImbalancePulse(
  leftWingKg: number,
  rightWingKg: number,
  fwcFlightPhase: number,
): WingImbalancePulse {
  const advisory =
    ADVISORY_FLIGHT_PHASES.includes(fwcFlightPhase) && Math.abs(leftWingKg - rightWingKg) > WING_IMBALANCE_ADVISORY_KG;
  return {
    left: advisory && leftWingKg > rightWingKg,
    right: advisory && rightWingKg > leftWingKg,
  };
}
