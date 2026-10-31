// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { LoadsheetResults } from './Loadsheet';
import { CG_ENVELOPES, CgEnvelope } from './CgEnvelopes';

/*
 * The CG diagram of the LOADSHEET results: the weight against the CG with the ZF, LDG and T.O CG envelopes and the DOW,
 * ZFW, TOW and LW points. Drawing coordinates in pixels, y downwards.
 */

/** The weight range the diagram shows, kg */
export const DIAGRAM_MIN_WEIGHT = 250_000;
export const DIAGRAM_MAX_WEIGHT = 600_000;

/** The CG range the diagram shows, % MAC */
export const DIAGRAM_MIN_CG = 25;
export const DIAGRAM_MAX_CG = 47;

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
 * The outline of a CG envelope.
 * @param size the drawing area
 * @param envelope the envelope
 * @returns the polygon points as an SVG points attribute
 */
export function envelopePolygon(size: CgDiagramSize, envelope: CgEnvelope): string {
  return envelope.vertices
    .map(([cg, weight]) => `${cgToX(size, cg).toFixed(1)},${weightToY(size, weight).toFixed(1)}`)
    .join(' ');
}

/**
 * The place of the name of an envelope: inside its upper aft corner, so the names of envelopes with different maximum
 * weights do not meet.
 * @param size the drawing area
 * @param envelope the envelope
 * @returns the position of the end of the name
 */
export function envelopeNamePosition(size: CgDiagramSize, envelope: CgEnvelope): { x: number; y: number } {
  const corner = envelope.vertices.reduce((best, vertex) =>
    vertex[1] > best[1] || (vertex[1] === best[1] && vertex[0] > best[0]) ? vertex : best,
  );
  return { x: cgToX(size, corner[0]) - 4, y: weightToY(size, corner[1]) + 13 };
}

/**
 * The line through the loading steps: from the DOW up to the ZFW and on to the TOW.
 * @param points the DOW, ZFW, TOW and LW points
 * @returns the polyline points as an SVG points attribute
 */
export function loadingPathPoints(points: readonly CgDiagramPoint[]): string {
  return points
    .filter((point) => point.name !== 'LW')
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');
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

/** A rectangle in drawing pixels */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/*
 * A point label is a 14 px name. Its box is larger than the harness text so a sim font 15 % wider still stays inside it.
 */
export const LABEL_WIDTH = 44;
export const LABEL_HEIGHT = 18;
/** The distance of the text baseline below the top of its box */
const LABEL_BASELINE = 14;
/** The baseline of a label level with its point sits this far below the point */
const LABEL_LEVEL_OFFSET = 4;
/** The lines a label may move from its point, nearest first */
const LABEL_LINE_OFFSETS = [0, 1, -1, 2, -2, 3, -3, 4, -4];
/** The distance between a point and the side of its label */
const LABEL_GAP = 8;
/** The radius of a point marker, which a label keeps clear of */
export const POINT_RADIUS = 5;
/** The width of the name of an envelope (12 px) and its line height */
const ENVELOPE_NAME_WIDTH = 30;
const ENVELOPE_NAME_HEIGHT = 14;

/**
 * @param a the first box
 * @param b the second box
 * @returns whether two boxes share an area; boxes that only touch do not overlap
 */
export function boxesOverlap(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Where a point label is drawn: the text starts at x on the right of its point and ends at x on the left of it */
export interface CgLabelPosition {
  readonly x: number;
  readonly y: number;
  readonly anchor: 'start' | 'end';
}

/**
 * @param label the label position
 * @returns the box the label takes, from its text anchor and baseline and the label size
 */
export function labelBox(label: CgLabelPosition): Box {
  const top = label.y - LABEL_BASELINE;
  const left = label.anchor === 'start' ? label.x : label.x - LABEL_WIDTH;
  return { left, top, right: left + LABEL_WIDTH, bottom: top + LABEL_HEIGHT };
}

/**
 * @param size the drawing area
 * @returns the frame of the diagram: the box the weight and CG ranges span
 */
export function diagramFrame(size: CgDiagramSize): Box {
  return {
    left: cgToX(size, DIAGRAM_MIN_CG),
    top: weightToY(size, DIAGRAM_MAX_WEIGHT),
    right: cgToX(size, DIAGRAM_MAX_CG),
    bottom: weightToY(size, DIAGRAM_MIN_WEIGHT),
  };
}

/**
 * @param size the drawing area
 * @param envelope the envelope
 * @returns the box the name of the envelope takes
 */
export function envelopeNameBox(size: CgDiagramSize, envelope: CgEnvelope): Box {
  const name = envelopeNamePosition(size, envelope);
  return {
    left: name.x - ENVELOPE_NAME_WIDTH,
    top: name.y - ENVELOPE_NAME_HEIGHT,
    right: name.x,
    bottom: name.y,
  };
}

/**
 * The label position of each point. A label sits level with its point on the right; when that overlaps another label,
 * another point, an envelope name or leaves the frame, the next place is tried: left of the point on the same line, then
 * right and left one line down, one line up, and so on up to four lines away.
 * @param size the drawing area
 * @param points the points, in drawing order
 * @returns the label positions, in the order of the points
 */
export function placeLabels(size: CgDiagramSize, points: readonly CgDiagramPoint[]): CgLabelPosition[] {
  const frame = diagramFrame(size);
  const insideFrame = (box: Box) =>
    box.left >= frame.left && box.right <= frame.right && box.top >= frame.top && box.bottom <= frame.bottom;
  const obstacles = CG_ENVELOPES.map((envelope) => envelopeNameBox(size, envelope));
  const pointBoxes = points.map((point) => ({
    left: point.x - POINT_RADIUS,
    top: point.y - POINT_RADIUS,
    right: point.x + POINT_RADIUS,
    bottom: point.y + POINT_RADIUS,
  }));

  const placed: CgLabelPosition[] = [];
  const placedBoxes: Box[] = [];
  points.forEach((point, i) => {
    const free = (box: Box) =>
      insideFrame(box) &&
      !placedBoxes.some((other) => boxesOverlap(box, other)) &&
      !obstacles.some((other) => boxesOverlap(box, other)) &&
      !pointBoxes.some((other, j) => j !== i && boxesOverlap(box, other));
    const candidates: CgLabelPosition[] = [];
    for (const lines of LABEL_LINE_OFFSETS) {
      const y = point.y + LABEL_LEVEL_OFFSET + lines * LABEL_HEIGHT;
      candidates.push({ x: point.x + LABEL_GAP, y, anchor: 'start' }, { x: point.x - LABEL_GAP, y, anchor: 'end' });
    }
    // With no free place (more labels than the diagram has room for) the label stays level with its point
    const chosen = candidates.find((candidate) => free(labelBox(candidate))) || candidates[0];
    placed.push(chosen);
    placedBoxes.push(labelBox(chosen));
  });
  return placed;
}
