// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { LoadsheetResults } from './Loadsheet';
import { takeoffCgLimits } from './LoadsheetFuel';

/*
 * The CG diagram of the LOADSHEET results: the weight against the CG with the CG envelope and the DOW, ZFW, TOW and
 * LW points. Drawing coordinates in pixels, y downwards.
 */

/** The weight range the diagram shows, kg */
export const DIAGRAM_MIN_WEIGHT = 250_000;
export const DIAGRAM_MAX_WEIGHT = 600_000;

/** The CG range the diagram shows, % MAC */
export const DIAGRAM_MIN_CG = 25;
export const DIAGRAM_MAX_CG = 47;

const ENVELOPE_WEIGHT_STEP = 10_000;

export interface CgDiagramSize {
  readonly width: number;
  readonly height: number;
  /** The space left for the axis labels */
  readonly marginLeft: number;
  readonly marginBottom: number;
  readonly marginTop: number;
  readonly marginRight: number;
}

export interface CgDiagramPoint {
  readonly name: 'DOW' | 'ZFW' | 'TOW' | 'LW';
  readonly x: number;
  readonly y: number;
  readonly outOfLimits: boolean;
}

/**
 * @param size the drawing area
 * @param cg the CG, % MAC
 * @returns the x position
 */
export function cgToX(size: CgDiagramSize, cg: number): number {
  const ratio = (cg - DIAGRAM_MIN_CG) / (DIAGRAM_MAX_CG - DIAGRAM_MIN_CG);
  return size.marginLeft + ratio * (size.width - size.marginLeft - size.marginRight);
}

/**
 * @param size the drawing area
 * @param weight the weight, kg
 * @returns the y position, heavier weights higher
 */
export function weightToY(size: CgDiagramSize, weight: number): number {
  const ratio = (weight - DIAGRAM_MIN_WEIGHT) / (DIAGRAM_MAX_WEIGHT - DIAGRAM_MIN_WEIGHT);
  return size.height - size.marginBottom - ratio * (size.height - size.marginTop - size.marginBottom);
}

/**
 * The outline of the CG envelope: the forward limit from the lightest to the heaviest weight, then the aft limit back.
 * @param size the drawing area
 * @param cgWithinLimits whether a CG is within the limits at a weight
 * @returns the polygon points as an SVG points attribute
 */
export function envelopePolygon(size: CgDiagramSize, cgWithinLimits: (cg: number, weight: number) => boolean): string {
  const forward: string[] = [];
  const aft: string[] = [];
  for (let weight = DIAGRAM_MIN_WEIGHT; weight <= DIAGRAM_MAX_WEIGHT; weight += ENVELOPE_WEIGHT_STEP) {
    const limits = takeoffCgLimits(weight, cgWithinLimits);
    if (limits === null) {
      continue;
    }
    const y = weightToY(size, weight).toFixed(1);
    forward.push(`${cgToX(size, limits.forward).toFixed(1)},${y}`);
    aft.unshift(`${cgToX(size, limits.aft).toFixed(1)},${y}`);
  }
  return forward.concat(aft).join(' ');
}

/**
 * @param size the drawing area
 * @param results the loadsheet results
 * @returns the DOW, ZFW, TOW and LW points; the DOW has no limit of its own
 */
export function cgDiagramPoints(size: CgDiagramSize, results: LoadsheetResults): CgDiagramPoint[] {
  const point = (name: CgDiagramPoint['name'], weight: number, cg: number, outOfLimits: boolean) => ({
    name,
    x: cgToX(size, cg),
    y: weightToY(size, weight),
    outOfLimits,
  });
  return [
    point('DOW', results.dow, results.docg, false),
    point('ZFW', results.zfw, results.zfcg, results.zfwOutOfLimits),
    point('TOW', results.tow, results.towCg, results.towOutOfLimits),
    point('LW', results.lw, results.lwCg, results.lwOutOfLimits),
  ];
}

/** The height of a label line and the width a label needs, pixels */
const LABEL_HEIGHT = 15;
const LABEL_WIDTH = 44;

/**
 * The label position of each point, to the right of the point; a label that would overlap one placed before it moves
 * down by a line until it is readable.
 * @param points the points, in drawing order
 * @returns the label positions, in the order of the points
 */
export function placeLabels(points: readonly CgDiagramPoint[]): { x: number; y: number }[] {
  const placed: { x: number; y: number }[] = [];
  for (const point of points) {
    const label = { x: point.x + 8, y: point.y + 4 };
    while (
      placed.some((other) => Math.abs(other.x - label.x) < LABEL_WIDTH && Math.abs(other.y - label.y) < LABEL_HEIGHT)
    ) {
      label.y += LABEL_HEIGHT;
    }
    placed.push(label);
  }
  return placed;
}
