//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

/** The health of the two NSS AVNCS ANSUs, written by the OIT (OIT/System/AircraftNetworkServerUnit.ts) */
export const NSS_AVNCS_ANSU_HEALTHY_VARS = ['L:A32NX_NSS_ANSU_1_IS_HEALTHY', 'L:A32NX_NSS_ANSU_2_IS_HEALTHY'];

/** The NSS DATA TO AVNCS pb-sw: 1 = normal, 0 = OFF */
export const NSS_DATA_TO_AVNCS_PB_VAR = 'L:A32NX_OVHD_NSS_DATA_TO_AVNCS_TOGGLE';

/**
 * The AOC (atsu.ts) runs while one NSS AVNCS ANSU hosts it and at least one Secure Communication Interface (SCI) links
 * the avionics to the NSS:
 * - Both ANSUs host the AOC: when ANSU 1 fails, ANSU 2 takes it over. An ANSU is healthy when powered, not failed, not
 *   reset and with the NSS master on (the OIT AircraftNetworkServerUnit).
 * - With both SCIs lost (COM NSS/AVNCS DATA XFR FAULT) the AOC is inoperative: it can no longer send or receive
 *   messages.
 * @param nssAvncsAnsuHealthy NSS AVNCS ANSU 1 and ANSU 2 healthy
 * @param sciFailed SCI 1 and SCI 2 failed (flyPad failures 46008, 46009)
 * @returns whether the AOC is available
 */
export function isAocAvailable(nssAvncsAnsuHealthy: readonly boolean[], sciFailed: readonly boolean[]): boolean {
  const bothSciFailed = sciFailed.length === 2 && sciFailed.every((failed) => failed);
  return nssAvncsAnsuHealthy.some((healthy) => healthy) && !bothSciFailed;
}

/**
 * NSS DATA TO AVNCS pb-sw OFF: the link between the NSS AVNCS side and the aircraft avionics is cut, so the AOC cannot
 * send messages to the ground but still receives some. The AOC then sends no downlink (messages and requests), the
 * uplinks still come in.
 * @param nssDataToAvncsPbOff the NSS DATA TO AVNCS pb-sw is OFF
 * @returns whether the AOC downlinks are inhibited
 */
export function areAocDownlinksInhibited(nssDataToAvncsPbOff: boolean): boolean {
  return nssDataToAvncsPbOff;
}
