// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  nearestOnSegment,
  taxiDistance,
  TaxiEdge,
  TaxiLineKind,
  TaxiNetwork,
  TaxiPoint,
  taxiName,
} from './taxiNetwork';

/** Where the taxi starts */
export type TaxiRouteStart =
  /** At a runway exit: its name and where it leaves the runway */
  | { kind: 'exit'; exit: string; point: TaxiPoint }
  /** At the aircraft, with its true heading in degrees (null when not known) */
  | { kind: 'position'; point: TaxiPoint; heading: number | null };

/** Where the taxi ends */
export type TaxiRouteTarget =
  /** At a parking stand, after landing */
  | { kind: 'stand'; name: string; point: TaxiPoint }
  /** On a runway for takeoff, at the end of its entry line (the route stops at the holding point before it) */
  | { kind: 'runway'; runway: string; entry: string; point: TaxiPoint };

export interface TaxiRouteRequest {
  start: TaxiRouteStart;
  to: TaxiRouteTarget;
  /** The taxiways of the clearance, in order; none for the suggested (shortest) route */
  via?: readonly string[];
}

export enum TaxiRouteError {
  None = 'None',
  /** The exit or the aircraft is not on the taxi network */
  NoStart = 'NoStart',
  /** The stand is not on the taxi network */
  NoStand = 'NoStand',
  /** The runway entry is not on the taxi network */
  NoEntry = 'NoEntry',
  /** No route (along the cleared taxiways) */
  NoRoute = 'NoRoute',
}

export interface TaxiRouteLeg {
  kind: TaxiLineKind;
  name: string | null;
  /** metres */
  length: number;
  /** The point halfway along the leg, to label it */
  mid: TaxiPoint;
}

/** A leg with its points, while the route is put together */
type LegPoints = Omit<TaxiRouteLeg, 'mid'> & { points: TaxiPoint[] };

/** The point halfway along a polyline */
function halfway(points: readonly TaxiPoint[], length: number): TaxiPoint {
  let remaining = length / 2;
  for (let i = 1; i < points.length; i++) {
    const d = taxiDistance(points[i - 1], points[i]);
    if (d >= remaining && d > 0) {
      const t = remaining / d;
      return [
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
      ];
    }
    remaining -= d;
  }
  return points[points.length - 1];
}

export interface TaxiRoute {
  error: TaxiRouteError;
  points: TaxiPoint[];
  /** metres */
  length: number;
  legs: TaxiRouteLeg[];
  /** The named taxiways of the route in order, as a clearance lists them */
  taxiways: string[];
}

/** The stand guidance lines of a stand pass within this distance of its location, in metres */
const STAND_LINE_RADIUS = 40;
/** The stand, the exit start and the aircraft must be within this distance of the network, in metres */
const START_RADIUS = 100;
/** Extra cost of taxiing away from the aircraft heading (turning back), in metres */
const TURN_BACK_PENALTY = 2000;
/** Cost factors: unnamed taxiway lines, and the stand and exit lines of other stands and exits (last resort) */
const UNNAMED_FACTOR = 1.2;
const OTHER_LINE_FACTOR = 3;

const NO_ROUTE = (error: TaxiRouteError): TaxiRoute => ({ error, points: [], length: 0, legs: [], taxiways: [] });

/** A binary heap of [cost, state] */
class Heap {
  private readonly items: [number, number][] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: [number, number]): void {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) {
        break;
      }
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }

  pop(): [number, number] {
    const a = this.items;
    const top = a[0];
    const last = a.pop() as [number, number];
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) {
          m = l;
        }
        if (r < a.length && a[r][0] < a[m][0]) {
          m = r;
        }
        if (m === i) {
          break;
        }
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** The edge of the network nearest to a point, among the edges accepted by the filter */
function nearestEdge(
  network: TaxiNetwork,
  p: TaxiPoint,
  accept: (e: TaxiEdge) => boolean,
): { edge: number; t: number; distance: number } | null {
  let best: { edge: number; t: number; distance: number } | null = null;
  network.edges.forEach((e, i) => {
    if (!accept(e)) {
      return;
    }
    const n = nearestOnSegment(p, network.nodes[e.from], network.nodes[e.to]);
    if (best === null || n.distance < best.distance) {
      best = { edge: i, t: n.t, distance: n.distance };
    }
  });
  return best;
}

/**
 * The taxi route from a runway exit or the aircraft (or a stand) to a stand or a runway entry, along the taxi network:
 * the shortest one, or the shortest one along the cleared taxiways in their order (only unnamed connecting lines between
 * them, and the entry line of the runway after the last one: a clearance to a holding point often leaves it out).
 */
export function taxiRoute(network: TaxiNetwork, request: TaxiRouteRequest): TaxiRoute {
  const { lines, nodes, edges, adjacency } = network;
  const via = request.via?.map((it) => taxiName(it)).filter((it): it is string => it !== null);
  const layers = via ? via.length + 1 : 1;
  const last = via ? via.length - 1 : -1;
  const start = request.start;
  const startExit = start.kind === 'exit' ? taxiName(start.exit) : null;
  const to = request.to;
  const entry = to.kind === 'runway' ? taxiName(to.entry) : null;

  // The stand: its lead-in lines, and the network node nearest to its location; or the runway entry node
  const standLines = new Set<number>();
  let target: number;
  if (to.kind === 'stand') {
    edges.forEach((e) => {
      if (
        lines[e.line].kind === TaxiLineKind.Stand &&
        nearestOnSegment(to.point, nodes[e.from], nodes[e.to]).distance < STAND_LINE_RADIUS
      ) {
        standLines.add(e.line);
      }
    });
    const standEdge = nearestEdge(network, to.point, (e) =>
      standLines.size === 0 ? lines[e.line].kind !== TaxiLineKind.Runway : standLines.has(e.line),
    );
    if (standEdge === null || standEdge.distance > START_RADIUS) {
      return NO_ROUTE(TaxiRouteError.NoStand);
    }
    const se = edges[standEdge.edge];
    target = taxiDistance(nodes[se.from], to.point) <= taxiDistance(nodes[se.to], to.point) ? se.from : se.to;
  } else {
    // The entry point is a node of the network
    let nearest = -1;
    nodes.forEach((p, n) => {
      if (nearest === -1 || taxiDistance(p, to.point) < taxiDistance(nodes[nearest], to.point)) {
        nearest = n;
      }
    });
    if (nearest === -1 || taxiDistance(nodes[nearest], to.point) > 5) {
      return NO_ROUTE(TaxiRouteError.NoEntry);
    }
    target = nearest;
  }
  /** The entry line of the runway can be taken after the last cleared taxiway */
  const isEntry = (name: string | null, k: number) => entry !== null && name === entry && (!via || k === last);

  // The start: the end of the exit line on the runway, or the aircraft on its nearest line
  const initial: { node: number; cost: number }[] = [];
  const startLines = new Set<number>();
  let startPoint: TaxiPoint | null = null;
  /** The line the aircraft is on */
  let startLine: number | null = null;
  if (start.kind === 'exit') {
    const exitEdge = nearestEdge(
      network,
      start.point,
      (e) => lines[e.line].kind === TaxiLineKind.Exit && lines[e.line].name === startExit,
    );
    if (exitEdge === null || exitEdge.distance > START_RADIUS) {
      return NO_ROUTE(TaxiRouteError.NoStart);
    }
    const e = edges[exitEdge.edge];
    const node = taxiDistance(nodes[e.from], start.point) <= taxiDistance(nodes[e.to], start.point) ? e.from : e.to;
    initial.push({ node, cost: 0 });
    startPoint = nodes[node];
  } else {
    const onEdge = nearestEdge(network, start.point, (e) => lines[e.line].kind !== TaxiLineKind.Runway);
    if (onEdge === null || onEdge.distance > START_RADIUS) {
      return NO_ROUTE(TaxiRouteError.NoStart);
    }
    const e = edges[onEdge.edge];
    startLines.add(e.line);
    startLine = e.line;
    startPoint = start.point;
    const a = nodes[e.from];
    const b = nodes[e.to];
    const heading = start.heading;
    for (const [node, toward] of [
      [e.from, a],
      [e.to, b],
    ] as [number, TaxiPoint][]) {
      let cost = taxiDistance(start.point, toward);
      if (heading !== null && cost > 1) {
        const dx = toward[0] - start.point[0];
        const dy = toward[1] - start.point[1];
        const ahead = dx * Math.sin((heading * Math.PI) / 180) + dy * Math.cos((heading * Math.PI) / 180);
        if (ahead < 0) {
          cost += TURN_BACK_PENALTY;
        }
      }
      initial.push({ node, cost });
    }
  }

  /** The cost of an edge from layer k, and the layer after it; null when it cannot be taken */
  const step = (edgeIndex: number, k: number, lastResort: boolean): [number, number] | null => {
    const e = edges[edgeIndex];
    const line = lines[e.line];
    if (line.kind === TaxiLineKind.Runway) {
      return null;
    }
    if (startLines.has(e.line) && k === -1) {
      return [e.length, k];
    }
    switch (line.kind) {
      case TaxiLineKind.Stand:
        if (via && k !== last) {
          return null;
        }
        if (standLines.has(e.line)) {
          return [e.length, k];
        }
        return lastResort ? [e.length * OTHER_LINE_FACTOR, k] : null;
      case TaxiLineKind.Exit:
        if (startExit !== null && line.name === startExit) {
          return k === -1 ? [e.length, k] : null;
        }
        if (isEntry(line.name, k)) {
          return [e.length, k];
        }
        return lastResort ? [e.length * OTHER_LINE_FACTOR, k] : null;
      default:
        if (line.name === null) {
          return [e.length * UNNAMED_FACTOR, k];
        }
        if (!via) {
          return [e.length, k];
        }
        if (k >= 0 && line.name === via[k]) {
          return [e.length, k];
        }
        if (k + 1 < via.length && line.name === via[k + 1]) {
          return [e.length, k + 1];
        }
        if (isEntry(line.name, k)) {
          return [e.length, k];
        }
        return null;
    }
  };

  const search = (lastResort: boolean): TaxiRoute | null => {
    // State: node * layers + (k + 1), k = index of the current cleared taxiway (-1 before the first one)
    const cost = new Map<number, number>();
    const previous = new Map<number, [number, number]>(); // state -> [previous state, edge]
    const heap = new Heap();
    for (const i of initial) {
      const s = i.node * layers;
      if (i.cost < (cost.get(s) ?? Infinity)) {
        cost.set(s, i.cost);
        heap.push([i.cost, s]);
      }
    }
    const goal = target * layers + (last + 1);
    while (heap.size > 0) {
      const [c, s] = heap.pop();
      if (c > (cost.get(s) ?? Infinity)) {
        continue;
      }
      if (s === goal) {
        break;
      }
      const node = Math.floor(s / layers);
      const k = (s % layers) - 1;
      for (const ei of adjacency[node]) {
        const next = step(ei, k, lastResort);
        if (next === null) {
          continue;
        }
        const e = edges[ei];
        const other = e.from === node ? e.to : e.from;
        const ns = other * layers + (next[1] + 1);
        const nc = c + next[0];
        if (nc < (cost.get(ns) ?? Infinity)) {
          cost.set(ns, nc);
          previous.set(ns, [s, ei]);
          heap.push([nc, ns]);
        }
      }
    }
    if (!cost.has(goal)) {
      return null;
    }

    const path: number[] = [];
    let s = goal;
    while (previous.has(s)) {
      const [p, ei] = previous.get(s) as [number, number];
      path.push(ei);
      s = p;
    }
    path.reverse();

    const points: TaxiPoint[] = [startPoint as TaxiPoint, nodes[Math.floor(s / layers)]];
    const legPoints: LegPoints[] = [];
    let at = Math.floor(s / layers);
    if (startLine !== null) {
      // From the aircraft to the first node, along the line it is on
      const partial = taxiDistance(startPoint as TaxiPoint, nodes[at]);
      if (partial > 0.01) {
        legPoints.push({
          kind: lines[startLine].kind,
          name: lines[startLine].name,
          length: partial,
          points: [startPoint as TaxiPoint, nodes[at]],
        });
      }
    }
    for (const ei of path) {
      const e = edges[ei];
      const from = nodes[at];
      at = e.from === at ? e.to : e.from;
      points.push(nodes[at]);
      const line = lines[e.line];
      const leg = legPoints[legPoints.length - 1];
      if (leg && leg.kind === line.kind && leg.name === line.name) {
        leg.length += e.length;
        leg.points.push(nodes[at]);
      } else {
        legPoints.push({ kind: line.kind, name: line.name, length: e.length, points: [from, nodes[at]] });
      }
    }
    if (to.kind === 'stand') {
      points.push(to.point);
    }
    const legs: TaxiRouteLeg[] = legPoints.map((l) => ({
      kind: l.kind,
      name: l.name,
      length: l.length,
      mid: halfway(l.points, l.length),
    }));
    const taxiways: string[] = [];
    for (const leg of legs) {
      if (leg.kind === TaxiLineKind.Taxiway && leg.name !== null && taxiways[taxiways.length - 1] !== leg.name) {
        taxiways.push(leg.name);
      }
    }
    const clean = points.filter((p, i) => i === 0 || taxiDistance(p, points[i - 1]) > 0.01);
    let length = 0;
    for (let i = 1; i < clean.length; i++) {
      length += taxiDistance(clean[i - 1], clean[i]);
    }
    return { error: TaxiRouteError.None, points: clean, length, legs, taxiways };
  };

  return search(false) ?? search(true) ?? NO_ROUTE(TaxiRouteError.NoRoute);
}

/** The taxiways of a clearance as the crew types it, e.g. "A, B K-L" */
export function parseTaxiClearance(text: string): string[] {
  return text
    .split(/[\s,;/-]+/)
    .map((it) => taxiName(it))
    .filter((it): it is string => it !== null);
}

/** A runway of the airport map, as polygons */
export interface TaxiRunway {
  /** e.g. 09R/27L */
  name: string;
  polygons: TaxiPoint[][];
}

function inPolygon(p: TaxiPoint, polygon: readonly TaxiPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * The runways the route enters, in order, with the point where it enters them (sampled every 5 m). The start is left
 * out when the route starts on a runway (at an exit).
 */
export function taxiRouteRunwayCrossings(
  points: readonly TaxiPoint[],
  runways: readonly TaxiRunway[],
): { runway: string; point: TaxiPoint }[] {
  const crossings: { runway: string; point: TaxiPoint }[] = [];
  let current: string | null | undefined = undefined;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const steps = Math.max(1, Math.ceil(taxiDistance(a, b) / 5));
    for (let k = i === 1 ? 0 : 1; k <= steps; k++) {
      const p: TaxiPoint = [a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps];
      const runway = runways.find((r) => r.polygons.some((poly) => inPolygon(p, poly)))?.name ?? null;
      if (current !== undefined && runway !== null && runway !== current) {
        crossings.push({ runway, point: p });
      }
      current = runway;
    }
  }
  return crossings;
}
