// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** An interactive point counts as an open door from this position (0 closed, 1 open) */
const OPEN_FROM = 0.99;

/**
 * The exits to toggle to close the doors: the open ones, on the captain's flyPad only. K:TOGGLE_AIRCRAFT_EXIT toggles,
 * so a second caller (another flyPad, or a page closing the same doors in the same frame while the door still reads
 * open) would open the door again; the root flyPad is the one owner.
 * @param openPositions A:INTERACTIVE POINT OPEN of the points 0, 1, 2... in percent over 100
 * @param isCaptainEfb whether this is the captain's flyPad
 * @returns the exit numbers, which are the interactive point + 1
 */
export function exitsToCloseOnMovement(openPositions: readonly number[], isCaptainEfb: boolean): number[] {
  if (!isCaptainEfb) {
    return [];
  }
  const exits: number[] = [];
  openPositions.forEach((position, point) => {
    if (position >= OPEN_FROM) {
      exits.push(point + 1);
    }
  });
  return exits;
}
