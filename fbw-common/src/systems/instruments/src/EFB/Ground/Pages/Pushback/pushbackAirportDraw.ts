// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { TaxiLineKind, TaxiPoint } from '@flybywiresim/fbw-sdk';
import { TaxiAirport } from '../Taxi/TaxiAirport';

/**
 * The drawing of the airport under the pushback map, kept cheap for the sim's browser: the map follows the aircraft
 * (its position is read every 50 ms), and drawing the whole Navigraph airport (thousands of points) on every update
 * halved the frame rate during a pushback (A380X, 2026-10-11: 21 FPS on the page, 42 FPS on another page). So:
 * - only the shapes and lines whose bounding box reaches the map window are drawn (at pushback zoom, a few stands);
 * - the map is drawn again only when the picture moves by about a pixel, and at most every MIN_REDRAW_INTERVAL_MS.
 */

/** A bounding box in airport coordinates (metres east and north of the reference point) */
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A polygon ring or a line with its bounding box */
export interface BoxedPoints {
  points: readonly TaxiPoint[];
  box: Box;
}

/** The airport's drawable shapes, each with its bounding box (computed once per airport) */
export interface PushbackAirportIndex {
  aprons: BoxedPoints[];
  taxiways: BoxedPoints[];
  runways: BoxedPoints[];
  standLines: BoxedPoints[];
  guidanceLines: BoxedPoints[];
}

/** The map is drawn again at most this often, in milliseconds */
export const MIN_REDRAW_INTERVAL_MS = 100;

/** The map is drawn again when the picture moves by this much at its edge, in pixels */
const REDRAW_THRESHOLD_PX = 1;

/** Shapes this far outside the window are still drawn (line widths, labels), in pixels */
const VIEW_MARGIN_PX = 30;

export function boxOf(points: readonly TaxiPoint[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

const boxed = (rings: readonly (readonly TaxiPoint[])[]): BoxedPoints[] =>
  rings.filter((points) => points.length > 0).map((points) => ({ points, box: boxOf(points) }));

/** The bounding boxes of an airport's shapes and lines */
export function indexAirport(airport: TaxiAirport): PushbackAirportIndex {
  const linesOf = (kinds: TaxiLineKind[]) =>
    boxed(airport.network.lines.filter((line) => kinds.includes(line.kind)).map((line) => line.points));
  return {
    aprons: boxed(airport.shapes.aprons),
    taxiways: boxed(airport.shapes.taxiways),
    runways: boxed(airport.shapes.runways),
    standLines: linesOf([TaxiLineKind.Stand]),
    guidanceLines: linesOf([TaxiLineKind.Taxiway, TaxiLineKind.Exit]),
  };
}

/**
 * The part of the airport the map window shows, whatever its rotation: the square around the window's centre whose
 * half side is half the window's diagonal, plus a margin.
 * @param cx the map centre, metres east of the reference point
 * @param cy the map centre, metres north of the reference point
 * @param width the window width, in pixels
 * @param height the window height, in pixels
 * @param pxPerMetre the map scale
 */
export function viewBox(cx: number, cy: number, width: number, height: number, pxPerMetre: number): Box {
  const half = (Math.hypot(width, height) / 2 + VIEW_MARGIN_PX) / pxPerMetre;
  return { minX: cx - half, minY: cy - half, maxX: cx + half, maxY: cy + half };
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** The shapes or lines that reach the view */
export function inView(items: readonly BoxedPoints[], view: Box): BoxedPoints[] {
  return items.filter((item) => boxesOverlap(item.box, view));
}

/** What the picture depends on */
export interface PushbackMapPicture {
  /** The airport drawn (its ICAO code), null when none */
  airport: string | null;
  /** The map centre in airport coordinates, in metres */
  cx: number;
  cy: number;
  headingTrue: number;
  pxPerMetre: number;
  width: number;
  height: number;
}

/**
 * Whether the picture moved enough to be drawn again: another airport, size or scale, a move of the centre by about a
 * pixel, or a turn that moves the window's corners by about a pixel.
 */
export function pictureChanged(drawn: PushbackMapPicture | null, next: PushbackMapPicture): boolean {
  if (
    drawn === null ||
    drawn.airport !== next.airport ||
    drawn.width !== next.width ||
    drawn.height !== next.height ||
    drawn.pxPerMetre !== next.pxPerMetre
  ) {
    return true;
  }
  const movedPx = Math.hypot(next.cx - drawn.cx, next.cy - drawn.cy) * next.pxPerMetre;
  const turnDeg = Math.abs(((next.headingTrue - drawn.headingTrue + 540) % 360) - 180);
  const turnedPx = ((turnDeg * Math.PI) / 180) * (Math.hypot(next.width, next.height) / 2);
  return movedPx >= REDRAW_THRESHOLD_PX || turnedPx >= REDRAW_THRESHOLD_PX;
}
