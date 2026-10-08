// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The green APU BLEED memo. A320 FCOM DSC-36-20 MEMO DISPLAY (a320_fcom.txt l.57855-57856): "APU BLEED: This memo
 * appears in green, if the APU is available and the APU BLEED pb-sw is ON." It followed the bleed valve position, so
 * it was missing while the valve opened and stayed with the pb OFF until the valve closed.
 * @param apuAvailable the APU is available
 * @param apuBleedPbOn the APU BLEED pb-sw is ON
 * @returns true when the memo is shown
 */
export function isApuBleedMemoShown(apuAvailable: boolean, apuBleedPbOn: boolean): boolean {
  return apuAvailable && apuBleedPbOn;
}

/**
 * The green APU AVAIL memo. A320 FCOM DSC-49-20 MEMO DISPLAY (a320_fcom.txt l.60857-60858): "APU AVAIL: This memo
 * appears in green, when APU N is above 99.5 %...". Design choice: APU BLEED replaces APU AVAIL, as before, so the two
 * memos now switch on the same APU BLEED pb-sw.
 * @param apuAvailable the APU is available
 * @param apuBleedPbOn the APU BLEED pb-sw is ON
 * @returns true when the memo is shown
 */
export function isApuAvailMemoShown(apuAvailable: boolean, apuBleedPbOn: boolean): boolean {
  return apuAvailable && !apuBleedPbOn;
}
