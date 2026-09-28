// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { taxiDistance, TaxiLineKind, TaxiNetwork, TaxiPoint } from './taxiNetwork';
import { TaxiRoute } from './taxiRoute';

/** A runway direction: its threshold and the far end of its centreline, in the airport map projection */
export interface TaxiRunwayAxis {
  /** e.g. 09R */
  ident: string;
  threshold: TaxiPoint;
  end: TaxiPoint;
}

/** Where a taxi line enters a runway */
export interface TaxiRunwayEntry {
  /** The taxiway (or exit line) name */
  name: string;
  /** The end of the line on the runway */
  point: TaxiPoint;
  /** From the threshold, in metres */
  distance: number;
  /** The runway length ahead, in metres */
  remaining: number;
}

/** A line end is on the runway within this distance of its centreline, in metres (half width 30 m and a margin) */
const RUNWAY_AREA = 40;
/** Entries before the threshold (displaced threshold, blast pad) up to this distance, in metres */
const BEFORE_THRESHOLD = 60;
/** The holding point is looked for on the last part of the route, in metres */
const HOLDING_POINT_SEARCH = 400;
/** An unnamed lead-on line takes the name of the first named line within this distance away from the runway, in metres */
const ENTRY_NAME_SEARCH = 300;

/** The name of the first named taxiway or exit line from a node, away from the runway (breadth first, by distance) */
function nameAwayFrom(network: TaxiNetwork, start: number, from: number): string | null {
  const distance = new Map<number, number>([
    [from, 0],
    [start, 0],
  ]);
  const queue = [start];
  while (queue.length > 0) {
    queue.sort((a, b) => (distance.get(a) as number) - (distance.get(b) as number));
    const n = queue.shift() as number;
    for (const ei of network.adjacency[n]) {
      const e = network.edges[ei];
      const line = network.lines[e.line];
      if (line.kind === TaxiLineKind.Runway || line.kind === TaxiLineKind.Stand) {
        continue;
      }
      if (line.name !== null) {
        return line.name;
      }
      const other = e.from === n ? e.to : e.from;
      const d = (distance.get(n) as number) + e.length;
      if (!distance.has(other) && d < ENTRY_NAME_SEARCH) {
        distance.set(other, d);
        queue.push(other);
      }
    }
  }
  return null;
}

/**
 * The entries of a runway: the taxiway and exit lines that leave the runway area (from their end on the runway or where
 * they cross its centreline), at their first point along the runway, in order from the threshold (the first one is the
 * full length entry). An unnamed lead-on line is named after the taxiway it comes from.
 */
export function taxiRunwayEntries(network: TaxiNetwork, axis: TaxiRunwayAxis): TaxiRunwayEntry[] {
  const length = taxiDistance(axis.threshold, axis.end);
  if (length < 1) {
    return [];
  }
  const ux = (axis.end[0] - axis.threshold[0]) / length;
  const uy = (axis.end[1] - axis.threshold[1]) / length;
  const along = (p: TaxiPoint) => (p[0] - axis.threshold[0]) * ux + (p[1] - axis.threshold[1]) * uy;
  const across = (p: TaxiPoint) => Math.abs((p[0] - axis.threshold[0]) * uy - (p[1] - axis.threshold[1]) * ux);

  const entries = new Map<string, TaxiRunwayEntry>();
  network.nodes.forEach((p, n) => {
    const s = along(p);
    if (across(p) > RUNWAY_AREA || s < -BEFORE_THRESHOLD || s > length) {
      return;
    }
    for (const ei of network.adjacency[n]) {
      const e = network.edges[ei];
      const line = network.lines[e.line];
      const otherNode = e.from === n ? e.to : e.from;
      if (
        line.kind === TaxiLineKind.Stand ||
        line.kind === TaxiLineKind.Runway ||
        across(network.nodes[otherNode]) <= RUNWAY_AREA
      ) {
        continue;
      }
      const name = line.name ?? nameAwayFrom(network, otherNode, n);
      if (name === null) {
        continue;
      }
      const distance = Math.max(0, s);
      const known = entries.get(name);
      if (known === undefined || distance < known.distance) {
        entries.set(name, { name, point: p, distance, remaining: length - distance });
      }
    }
  });
  return [...entries.values()].sort((a, b) => a.distance - b.distance);
}

function segmentCrossing(a: TaxiPoint, b: TaxiPoint, c: TaxiPoint, d: TaxiPoint): number | null {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) {
    return null;
  }
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / denominator;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/**
 * The route to a runway stopped at its holding point: the last runway holding position line it crosses before its end
 * (within the last 400 m). The route is unchanged when it crosses none.
 */
export function taxiRouteToHoldingPoint(
  route: TaxiRoute,
  holdingLines: readonly TaxiPoint[][],
): { route: TaxiRoute; holdingPoint: TaxiPoint | null } {
  const points = route.points;
  let fromEnd = 0;
  for (let i = points.length - 1; i > 0 && fromEnd < HOLDING_POINT_SEARCH; i--) {
    const a = points[i - 1];
    const b = points[i];
    // The crossing nearest to the end of the route on this segment
    let best: number | null = null;
    for (const line of holdingLines) {
      for (let j = 1; j < line.length; j++) {
        const t = segmentCrossing(a, b, line[j - 1], line[j]);
        if (t !== null && (best === null || t > best)) {
          best = t;
        }
      }
    }
    if (best !== null) {
      const holdingPoint: TaxiPoint = [a[0] + (b[0] - a[0]) * best, a[1] + (b[1] - a[1]) * best];
      const kept = [...points.slice(0, i), holdingPoint];
      let length = 0;
      for (let k = 1; k < kept.length; k++) {
        length += taxiDistance(kept[k - 1], kept[k]);
      }
      // The legs lose the part after the holding point, from the end
      let cut = route.length - length;
      const legs = route.legs.map((l) => ({ ...l }));
      while (cut > 0 && legs.length > 0) {
        const last = legs[legs.length - 1];
        if (last.length > cut) {
          last.length -= cut;
          cut = 0;
        } else {
          cut -= last.length;
          legs.pop();
        }
      }
      return { route: { ...route, points: kept, length, legs }, holdingPoint };
    }
    fromEnd += taxiDistance(a, b);
  }
  return { route, holdingPoint: null };
}
