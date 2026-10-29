// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The green APU BLEED memo: shown when the APU is available and the APU BLEED pb-sw is ON. It follows the pb-sw, not
 * the bleed valve position, so it does not lag behind the valve travel.
 * @param apuAvailable the APU is available
 * @param apuBleedPbOn the APU BLEED pb-sw is ON
 * @returns true when the memo is shown
 */
export function isApuBleedMemoShown(apuAvailable: boolean, apuBleedPbOn: boolean): boolean {
  return apuAvailable && apuBleedPbOn;
}

/**
 * The green APU AVAIL memo: shown when the APU is available (N above 99.5 %). Design choice: APU BLEED replaces APU
 * AVAIL, so the two memos switch on the same APU BLEED pb-sw.
 * @param apuAvailable the APU is available
 * @param apuBleedPbOn the APU BLEED pb-sw is ON
 * @returns true when the memo is shown
 */
export function isApuAvailMemoShown(apuAvailable: boolean, apuBleedPbOn: boolean): boolean {
  return apuAvailable && !apuBleedPbOn;
}
