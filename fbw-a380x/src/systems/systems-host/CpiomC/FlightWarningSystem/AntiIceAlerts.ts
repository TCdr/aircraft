// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A-ICE ICE DETECTED and A-ICE SEVERE ICE DETECTED of the A380X FWS (A380 FCOM PRO-ABN-ECAM-10-30, a380_fcom.txt
 * l.156579-156607 and l.157282-157300; DSC-30-10-10 ice detection, l.61802-61811). The ice detection itself is
 * FwsCore's (iceDetectedTimer2Status: icing detected and not all ENG A-ICE ON; iceSevereDetectedTimerStatus: severe
 * icing).
 */

/** Both alerts: flight phase 8 only (airbus-a380-fcom PDF p.5344 and p.5365) */
export const ICE_DETECTED_PHASE_INHIBITION = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12];

/**
 * A-ICE SEVERE ICE DETECTED: "If at least one ice detector subsequently detects severe icing conditions, and if wing
 * anti-ice is off" (l.61810-61811); "The alert no longer appears when the WING A-ICE pb is set to ON." (l.157289).
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
