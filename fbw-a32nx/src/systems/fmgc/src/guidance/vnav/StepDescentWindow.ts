// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** A320 FCOM DSC-22_20-60-100 STEP ALTS: "STEP AHEAD", when the distance to the step point is less than 20 NM */
export const STEP_AHEAD_DISTANCE_NM = 20;

/**
 * Whether lowering the FCU altitude initiates the step descent rather than the descent phase.
 *
 * A320 FCOM DSC-22_20-60-100 STEP ALTS: "When reaching the step point, the steps must be initiated by the crew by
 * selecting the new CRZ FL, and pressing the FCU ALT selector knob", and the guidance is then "THR IDLE/DES with
 * V/S = -1 000 ft/min for a step descent". FCOM PRO-NOR-SRP-01-50: "If the FCU-selected altitude is lower than the
 * previous CRZ FL and the aircraft is within 200 NM of its destination, the system activates the descent phase."
 * The step descent therefore takes precedence only while the aircraft is reaching the step point (STEP AHEAD); a
 * step descent further down the flight plan does not prevent the crew from starting the descent.
 * @param distanceToStepPoint the distance from the aircraft to the next step descent point, in NM, or undefined
 * without a step descent ahead
 * @returns true when the crew action initiates the step descent
 */
export function isStepDescentInitiation(distanceToStepPoint: number | undefined): boolean {
  return distanceToStepPoint !== undefined && distanceToStepPoint < STEP_AHEAD_DISTANCE_NM;
}
