// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The data link between the NSS AVNCS side and the aircraft avionics, through the two Secure Communication Interfaces
 * (SCI 1 and 2, one is enough):
 * - Normal: both ways.
 * - NSS DATA TO AVNCS pb-sw OFF: only from the avionics to the NSS. The AOC can no longer send messages to the ground
 *   but still receives some, the logbook loses its communication with the ground, and nothing the NSS applications
 *   send to the avionics gets there.
 * - Both SCIs lost: no exchange at all. The AOC is inoperative and the logbook loses its ground communication too.
 * The AOC and the logbook reach the ground through the avionics communication router, so their ground link needs the
 * NSS to avionics direction.
 */

export enum NssAvionicsLink {
  BothWays = 'both-ways',
  AvionicsToNssOnly = 'avionics-to-nss-only',
  Lost = 'lost',
}

/**
 * @param nssDataToAvncsOff the NSS DATA TO AVNCS pb-sw is OFF
 * @param sciFailed SCI 1 and SCI 2 failed
 * @returns the state of the link
 */
export function nssAvionicsLink(nssDataToAvncsOff: boolean, sciFailed: readonly boolean[]): NssAvionicsLink {
  if (sciFailed.length > 0 && sciFailed.every((failed) => failed)) {
    return NssAvionicsLink.Lost;
  }
  return nssDataToAvncsOff ? NssAvionicsLink.AvionicsToNssOnly : NssAvionicsLink.BothWays;
}

/**
 * @param link the state of the link
 * @returns whether the NSS applications can send data to the avionics, and so to the ground
 */
export function canSendToAvionics(link: NssAvionicsLink): boolean {
  return link === NssAvionicsLink.BothWays;
}

/**
 * @param link the state of the link
 * @returns whether the avionics data (FMS flight number, fuel on board...) reaches the NSS
 */
export function canReceiveFromAvionics(link: NssAvionicsLink): boolean {
  return link !== NssAvionicsLink.Lost;
}

/**
 * The INOP SYS name of the ECAM alert the crew sees when the link degrades
 * @param link the state of the link
 * @returns the name, null while the link works both ways
 */
function inopSystemName(link: NssAvionicsLink): string | null {
  switch (link) {
    case NssAvionicsLink.AvionicsToNssOnly:
      return 'NSS DATA TO AVNCS';
    case NssAvionicsLink.Lost:
      return 'NSS/AVNCS DATA XFR';
    default:
      return null;
  }
}

/**
 * The reason an entry did not reach the avionics. Design choice: the INOP SYS name of the ECAM alert.
 * @param link the state of the link
 * @returns the message, empty while the NSS can send to the avionics
 */
export function notSentToAvionicsMessage(link: NssAvionicsLink): string {
  const name = inopSystemName(link);
  return name === null ? '' : `NOT SENT: ${name} INOP`;
}

/**
 * The message toolbar text when the link degrades. Design choice: the INOP SYS name of the ECAM alert, short enough
 * for the toolbar.
 * @param link the state of the link
 * @returns the message, null while the link works both ways
 */
export function linkDegradedToolbarText(link: NssAvionicsLink): string | null {
  const name = inopSystemName(link);
  return name === null ? null : `${name} INOP`;
}
