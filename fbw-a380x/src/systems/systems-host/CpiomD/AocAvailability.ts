//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

/**
 * The AOC (atsu.ts) runs while AC BUS 1 is powered and at least one Secure Communication Interface (SCI) links the
 * avionics to the NSS: "Both SCIs are lost. ... The AOC is inoperative. It can no longer send and receive messages
 * to/from the ground." (A380 FCOM COM NSS/AVNCS DATA XFR FAULT, a380_fcom.txt l.169942-169947)
 * @param acBus1Powered AC BUS 1 powered (the AOC power condition)
 * @param sciFailed SCI 1 and SCI 2 failed (flyPad failures 46008, 46009)
 * @returns whether the AOC is available
 */
export function isAocAvailable(acBus1Powered: boolean, sciFailed: readonly boolean[]): boolean {
  const bothSciFailed = sciFailed.length === 2 && sciFailed.every((failed) => failed);
  return acBus1Powered && !bothSciFailed;
}
