// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { CanvasConst } from './Constants';

/** The smallest balance chart height, in px: the fixed height it had before it filled its card */
export const PAYLOAD_CHART_MIN_HEIGHT = 280;

/** The room left under the chart, in px: the bottom weight label (centred on the bottom line) and the unit under it */
const BOTTOM_ROOM = 34;

/** The room kept inside the canvas under the lowest weight line, in px, so that a 2 px envelope line on it is not cut */
export const PAYLOAD_CHART_PLOT_PAD = 2;

/** The chart weight grid: from max (top line) down by `lines` steps of `scale` kg (min = max - lines * scale) */
export interface ChartWeightGrid {
  max: number;
  lines: number;
  scale: number;
}

/**
 * The vertical position of a weight on the balance chart
 * @param weight the weight, in kg
 * @param grid the weight grid of the chart
 * @param height the chart height, in px
 * @returns the y coordinate, in px from the top of the chart (the lowest grid weight sits PAYLOAD_CHART_PLOT_PAD above
 * the bottom)
 */
export function chartWeightToY(weight: number, grid: ChartWeightGrid, height: number): number {
  const yStep = (height - PAYLOAD_CHART_PLOT_PAD) / grid.lines;
  return ((grid.max - weight) * yStep) / grid.scale;
}

/** The room over the CG axis labels, in px */
const LABEL_ROOM = 8;

/**
 * The balance chart height that fills an area of the card, and its top margin. The CG axis labels are drawn over the
 * chart, at a fraction of its height (CanvasConst.cgAxis.y), so the top margin grows with the chart.
 * @param areaHeight the height of the card below its title, in px
 * @returns the chart height and its top margin, in px
 */
export function payloadChartFit(areaHeight: number): { height: number; marginTop: number } {
  const labelFraction = -CanvasConst.cgAxis.y;
  const fitted = Math.floor((areaHeight - LABEL_ROOM - BOTTOM_ROOM) / (1 + labelFraction));
  const height = Math.max(PAYLOAD_CHART_MIN_HEIGHT, fitted);
  return { height, marginTop: Math.ceil(labelFraction * height) + LABEL_ROOM };
}
