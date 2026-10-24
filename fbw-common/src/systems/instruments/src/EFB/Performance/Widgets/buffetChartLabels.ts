// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The point of a buffet line where its label goes: the preferred one, else the nearest one below it (then above it)
 * whose label stays `gap` away from a text band across the chart, e.g. the maximum operating altitude line and its
 * label. The line moves with weight and CG, so a fixed point can land on that text.
 * @param ys the drawing y of each point of the line, lowest flight level first
 * @param preferred the index of the preferred point
 * @param avoidY the drawing y of the middle of the band
 * @param gap the smallest distance between a label and the band middle
 * @returns the index of the point for the label
 */
export function clearLabelIndex(ys: number[], preferred: number, avoidY: number, gap: number): number {
  const clear = (index: number) => Math.abs(ys[index] - avoidY) >= gap;
  for (let index = preferred; index >= 0; index--) {
    if (clear(index)) {
      return index;
    }
  }
  for (let index = preferred + 1; index < ys.length; index++) {
    if (clear(index)) {
      return index;
    }
  }
  return preferred;
}
