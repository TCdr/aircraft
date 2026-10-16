//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

/** The health of the two NSS AVNCS ANSUs, written by the OIT (OIT/System/AircraftNetworkServerUnit.ts) */
export const NSS_AVNCS_ANSU_HEALTHY_VARS = ['L:A32NX_NSS_ANSU_1_IS_HEALTHY', 'L:A32NX_NSS_ANSU_2_IS_HEALTHY'];

/** The NSS DATA TO AVNCS pb-sw: 1 = normal, 0 = OFF (a380-simvars.md) */
export const NSS_DATA_TO_AVNCS_PB_VAR = 'L:A32NX_OVHD_NSS_DATA_TO_AVNCS_TOGGLE';

/**
 * The AOC (atsu.ts) runs while one NSS AVNCS ANSU hosts it and at least one Secure Communication Interface (SCI) links
 * the avionics to the NSS:
 * - "The AOC function is hosted by the avionics domain of both Avionics Network Server Units (ANSU 1 and ANSU 2). In the
 *   case of an ANSU 1 failure, ANSU 2 provides the AOC application." (A380 FCOM DSC-46-40-10-20, a380_fcom.txt
 *   l.107931-107932). An ANSU is healthy when powered, not failed, not reset and with the NSS master on (the OIT
 *   AircraftNetworkServerUnit, its supplies from DSC-46-20-70).
 * - "Both SCIs are lost. ... The AOC is inoperative. It can no longer send and receive messages to/from the ground."
 *   (COM NSS/AVNCS DATA XFR FAULT, l.169942-169947)
 * @param nssAvncsAnsuHealthy NSS AVNCS ANSU 1 and ANSU 2 healthy
 * @param sciFailed SCI 1 and SCI 2 failed (flyPad failures 46008, 46009)
 * @returns whether the AOC is available
 */
export function isAocAvailable(nssAvncsAnsuHealthy: readonly boolean[], sciFailed: readonly boolean[]): boolean {
  const bothSciFailed = sciFailed.length === 2 && sciFailed.every((failed) => failed);
  return nssAvncsAnsuHealthy.some((healthy) => healthy) && !bothSciFailed;
}

/**
 * NSS DATA TO AVNCS pb-sw OFF: "Communication between the NSS AVNCS side and the aircraft avionics is disabled. The AOC
 * can no longer send messages to the ground but can still receive some." (A380 FCOM DSC-46-20-20-80, a380_fcom.txt
 * l.103225-103226; COM NSS DATA TO AVNCS XFR FAULT, l.169906-169914: "the AOC and the eLogbook applications cannot send
 * data to the ground"). The AOC then sends no downlink (messages and requests), the uplinks still come in.
 * @param nssDataToAvncsPbOff the NSS DATA TO AVNCS pb-sw is OFF
 * @returns whether the AOC downlinks are inhibited
 */
export function areAocDownlinksInhibited(nssDataToAvncsPbOff: boolean): boolean {
  return nssDataToAvncsPbOff;
}
