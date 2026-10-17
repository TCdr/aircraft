// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A-ICE ICE DETECTED and A-ICE SEVERE ICE DETECTED of the A380X FWS. The ice detection itself is FwsCore's
 * (iceDetectedTimer2Status: icing detected and not all ENG A-ICE ON; iceSevereDetectedTimerStatus: severe icing).
 */

/** Both alerts: flight phase 8 only */
export const ICE_DETECTED_PHASE_INHIBITION = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12];

/**
 * A-ICE SEVERE ICE DETECTED: an ice detector detects severe icing while the wing anti-ice is off; setting the WING
 * A-ICE pb ON clears the alert.
 * @param severeIcingDetected the ice detectors detect severe icing (about 5 mm of ice)
 * @param wingAntiIceOn the WING A-ICE pb is ON
 * @returns whether the alert condition is true
 */
export function isSevereIceDetected(severeIcingDetected: boolean, wingAntiIceOn: boolean): boolean {
  return severeIcingDetected && !wingAntiIceOn;
}

/**
 * The lines ENG 1 A-ICE ... ON to ENG 4 A-ICE ... ON (both alerts), then WING A-ICE ... ON (SEVERE ICE DETECTED only).
 * @param engAntiIceOn the ENG 1 to 4 A-ICE pb are ON
 * @param wingAntiIceOn the WING A-ICE pb is ON, null for ICE DETECTED (no WING A-ICE line)
 * @returns which lines are done
 */
export function antiIceItemsChecked(engAntiIceOn: readonly boolean[], wingAntiIceOn: boolean | null): boolean[] {
  return wingAntiIceOn === null ? [...engAntiIceOn] : [...engAntiIceOn, wingAntiIceOn];
}
