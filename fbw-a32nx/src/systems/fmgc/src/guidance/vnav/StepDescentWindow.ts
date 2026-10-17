// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** STEP ALTS page: STEP AHEAD is shown when the step point is closer than this, NM */
const STEP_AHEAD_DISTANCE_NM = 20;

/**
 * Whether lowering the FCU altitude initiates the step descent rather than the descent phase.
 *
 * At the step point the crew starts the step by selecting the new CRZ FL and pushing the FCU ALT knob, and a step
 * descent is flown in THR IDLE/DES at -1 000 ft/min. An FCU altitude below the CRZ FL within 200 NM of the destination
 * starts the descent phase.
 * The step descent therefore takes precedence only while the aircraft is reaching the step point (STEP AHEAD); a
 * step descent further down the flight plan does not prevent the crew from starting the descent.
 * @param distanceToStepPoint the distance from the aircraft to the next step descent point, in NM, or undefined
 * without a step descent ahead
 * @returns true when the crew action initiates the step descent
 */
export function isStepDescentInitiation(distanceToStepPoint: number | undefined): boolean {
  return distanceToStepPoint !== undefined && distanceToStepPoint < STEP_AHEAD_DISTANCE_NM;
}
