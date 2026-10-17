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

export type TaxiRouteStart =
  /** At a runway exit: its name and where it leaves the runway */
  | { kind: 'exit'; exit: string; point: TaxiPoint }
  /** At the aircraft, with its true heading in degrees (null when not known) */
  | { kind: 'position'; point: TaxiPoint; heading: number | null };

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
  /** The runways the clearance says to cross, e.g. 34L (see {@link readTaxiClearance}) */
  crossRunways?: readonly string[];
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
  start: TaxiPoint;
  /** The point halfway along the leg, to label it */
  mid: TaxiPoint;
}

/** A leg with its points, while the route is put together */
type LegPoints = Omit<TaxiRouteLeg, 'start' | 'mid'> & { points: TaxiPoint[] };

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
/**
 * A clearance often leaves out the first taxiways from the stand ("taxi via W, A, E" from a stand on the apron line L4):
 * before the first cleared taxiway, the route can follow taxiways that are not in the clearance, up to this distance
 * from the start (metres), at this cost factor (the route joins the clearance as soon as it can)
 */
const LEAD_IN_LIMIT = 2000;
const LEAD_IN_FACTOR = 1.5;
/**
 * Extra cost of a runway crossing before the first cleared taxiway that the clearance does not say to cross, in
 * metres: the route goes round when it can (a runway is crossed only with a clearance)
 */
const UNCLEARED_CROSSING_PENALTY = 10000;

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
 * Before the first cleared taxiway, other taxiways near the start lead to it (a clearance from a stand often leaves out
 * the apron taxiways), crossing a runway only when the clearance says so or there is no other way.
 */
export function taxiRoute(network: TaxiNetwork, request: TaxiRouteRequest): TaxiRoute {
  const { lines, nodes, edges, adjacency } = network;
  // A taxiway said twice in a row is one taxiway (C1 typed as the last taxiway and again as the holding point)
  const via = request.via
    ?.map((it) => taxiName(it))
    .filter((it, i, all): it is string => it !== null && (i === 0 || it !== all[i - 1]));
  const viaNames = new Set(via ?? []);
  const layers = via ? via.length + 1 : 1;
  const last = via ? via.length - 1 : -1;
  const start = request.start;
  const startExit = start.kind === 'exit' ? taxiName(start.exit) : null;
  const to = request.to;
  const entry = to.kind === 'runway' ? taxiName(to.entry) : null;

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

  /** The start nodes, with the index of the cleared taxiway the route is on there (-1 before the first one) */
  const initial: { node: number; cost: number; k: number }[] = [];
  const startLines = new Set<number>();
  let startPoint: TaxiPoint | null = null;
  let startLine: number | null = null;
  /** The edge the aircraft is on: the aircraft splits it, so the route never takes it whole (a U-turn through the aircraft) */
  let startEdge = -1;
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
    // A clearance that starts with the exit ("B1, A, K") is along the clearance from the start
    initial.push({ node, cost: 0, k: via && via[0] === startExit ? 0 : -1 });
    startPoint = nodes[node];
  } else {
    const onEdge = nearestEdge(network, start.point, (e) => lines[e.line].kind !== TaxiLineKind.Runway);
    if (onEdge === null || onEdge.distance > START_RADIUS) {
      return NO_ROUTE(TaxiRouteError.NoStart);
    }
    const e = edges[onEdge.edge];
    startEdge = onEdge.edge;
    startLines.add(e.line);
    startLine = e.line;
    startPoint = start.point;
    const a = nodes[e.from];
    const b = nodes[e.to];
    const heading = start.heading;
    // The aircraft on the first cleared taxiway is already along the clearance
    const k = via && lines[e.line].name === via[0] ? 0 : -1;
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
      initial.push({ node, cost, k });
    }
  }

  // The runways of the network nodes on a runway centreline (where a taxi line crosses or enters a runway), and the
  // nodes where the clearance says to cross
  const runwayAt = new Map<number, string[]>();
  edges.forEach((e) => {
    const line = lines[e.line];
    if (line.kind === TaxiLineKind.Runway && line.name !== null) {
      for (const n of [e.from, e.to]) {
        const known = runwayAt.get(n) ?? [];
        if (!known.includes(line.name)) {
          runwayAt.set(n, [...known, line.name]);
        }
      }
    }
  });
  const crossRunways = new Set((request.crossRunways ?? []).map(runwayDesignator));
  /** A runway at this node that the clearance does not say to cross (the runway names are e.g. 16R.34L) */
  const unclearedRunwayAt = (node: number) =>
    (runwayAt.get(node) ?? []).some(
      (runway) => !runway.split('.').some((it) => crossRunways.has(runwayDesignator(it))),
    );

  // How far each node is from the start along the lines that can lead to the first cleared taxiway (any line but the
  // cleared ones and the runway centrelines): the taxiways before the first cleared one are taken only near the start
  const leadInDistance = new Map<number, number>();
  if (via) {
    const heap = new Heap();
    for (const i of initial) {
      const d = taxiDistance(startPoint as TaxiPoint, nodes[i.node]);
      if (d < (leadInDistance.get(i.node) ?? Infinity)) {
        leadInDistance.set(i.node, d);
        heap.push([d, i.node]);
      }
    }
    while (heap.size > 0) {
      const [d, node] = heap.pop();
      if (d > (leadInDistance.get(node) ?? Infinity) || d > LEAD_IN_LIMIT) {
        continue;
      }
      for (const ei of adjacency[node]) {
        const e = edges[ei];
        const line = lines[e.line];
        if (ei === startEdge || line.kind === TaxiLineKind.Runway || (line.name !== null && viaNames.has(line.name))) {
          continue;
        }
        const other = e.from === node ? e.to : e.from;
        if (d + e.length < (leadInDistance.get(other) ?? Infinity)) {
          leadInDistance.set(other, d + e.length);
          heap.push([d + e.length, other]);
        }
      }
    }
  }

  /** The layer after a line of the clearance taken from layer k: the current cleared taxiway or the next one */
  const cleared = (name: string | null, k: number): number | null => {
    if (!via || name === null) {
      return null;
    }
    if (k >= 0 && name === via[k]) {
      return k;
    }
    if (k + 1 < via.length && name === via[k + 1]) {
      return k + 1;
    }
    return null;
  };
  /** A taxiway that is not in the clearance, taken before its first taxiway, near the start */
  const leadIn = (e: TaxiEdge, name: string | null, k: number): boolean =>
    via !== undefined &&
    k === -1 &&
    name !== null &&
    !viaNames.has(name) &&
    (leadInDistance.get(e.from) ?? Infinity) <= LEAD_IN_LIMIT &&
    (leadInDistance.get(e.to) ?? Infinity) <= LEAD_IN_LIMIT;

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
    let next: number | null;
    switch (line.kind) {
      case TaxiLineKind.Stand:
        // With a clearance, stand lines only before its first taxiway (leaving the stand, possibly along the line of
        // another stand: a stand with an alternative position) or after its last one (to the stand)
        if (via && k !== last && k !== -1) {
          return null;
        }
        if (standLines.has(e.line)) {
          return [e.length, k];
        }
        return lastResort ? [e.length * OTHER_LINE_FACTOR, k] : null;
      case TaxiLineKind.Exit:
        if (startExit !== null && line.name === startExit) {
          return k === -1 || (k === 0 && via?.[0] === startExit) ? [e.length, k] : null;
        }
        // A runway exit line named in the clearance (e.g. the entry C1, or L4 across a runway) is a cleared taxiway
        next = cleared(line.name, k);
        if (next !== null) {
          return [e.length, next];
        }
        if (isEntry(line.name, k)) {
          return [e.length, k];
        }
        if (leadIn(e, line.name, k)) {
          return [e.length * LEAD_IN_FACTOR, k];
        }
        // Other exit lines as a last resort, but never a cleared one out of its order
        return lastResort && !(line.name !== null && viaNames.has(line.name))
          ? [e.length * OTHER_LINE_FACTOR, k]
          : null;
      default:
        if (line.name === null) {
          return [e.length * UNNAMED_FACTOR, k];
        }
        if (!via) {
          return [e.length, k];
        }
        next = cleared(line.name, k);
        if (next !== null) {
          return [e.length, next];
        }
        if (isEntry(line.name, k)) {
          return [e.length, k];
        }
        if (leadIn(e, line.name, k)) {
          return [e.length * LEAD_IN_FACTOR, k];
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
      const s = i.node * layers + (i.k + 1);
      // The line the aircraft is on can reach a runway centreline at its next node: an uncleared crossing too
      const c =
        via && i.k === -1 && i.node !== target && unclearedRunwayAt(i.node)
          ? i.cost + UNCLEARED_CROSSING_PENALTY
          : i.cost;
      if (c < (cost.get(s) ?? Infinity)) {
        cost.set(s, c);
        heap.push([c, s]);
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
        if (ei === startEdge) {
          continue;
        }
        const next = step(ei, k, lastResort);
        if (next === null) {
          continue;
        }
        const e = edges[ei];
        const other = e.from === node ? e.to : e.from;
        const ns = other * layers + (next[1] + 1);
        let nc = c + next[0];
        // Before the first cleared taxiway, a runway the clearance does not say to cross: only when there is no other
        // way (the crossing shows on the map)
        if (via && next[1] === -1 && other !== target && unclearedRunwayAt(other)) {
          nc += UNCLEARED_CROSSING_PENALTY;
        }
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
      start: l.points[0],
      mid: halfway(l.points, l.length),
    }));
    // The taxiways as a clearance lists them: the taxiway lines, and the runway exit lines other than the exit the
    // route starts from (an exit line can be a runway entry or a crossing taxiway, e.g. C1)
    const taxiways: string[] = [];
    for (const leg of legs) {
      const listed = leg.kind === TaxiLineKind.Taxiway || (leg.kind === TaxiLineKind.Exit && leg.name !== startExit);
      if (listed && leg.name !== null && taxiways[taxiways.length - 1] !== leg.name) {
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

/** Flags closer than this to the previous one are left out, in metres */
const FLAG_SPACING = 20;

/**
 * The points to mark the route with flags on the airport map: where each taxiway (or runway entry line) of the route
 * starts, after the one the route starts on, and the end of the route (the stand or the holding point).
 */
export function taxiRouteFlagPoints(route: TaxiRoute): TaxiPoint[] {
  const points: TaxiPoint[] = [];
  const add = (p: TaxiPoint) => {
    if (points.length === 0 || taxiDistance(points[points.length - 1], p) >= FLAG_SPACING) {
      points.push(p);
    }
  };
  let previous: string | null = null;
  route.legs.forEach((leg, i) => {
    if (leg.name === null || leg.kind === TaxiLineKind.Stand) {
      return;
    }
    if (i > 0 && leg.name !== previous) {
      add(leg.start);
    }
    previous = leg.name;
  });
  if (route.points.length > 0) {
    add(route.points[route.points.length - 1]);
  }
  return points;
}

/** A taxi clearance as read from the text the crew typed or pasted */
export interface TaxiClearance {
  /** The cleared taxiways, in order (the clearance limit, e.g. the holding point, last) */
  taxiways: string[];
  /** The runways the clearance says to cross, e.g. 34L (two digits) */
  crossings: string[];
}

/** The words of an ATC taxi instruction that are not taxiway names (unless the airport has a taxiway of that name) */
const PHRASEOLOGY = new Set([
  'AND',
  'AT',
  'BEHIND',
  'CONTACT',
  'CONTINUE',
  'CROSSING',
  'DEPARTURE',
  'EXPECT',
  'FOLLOW',
  'FROM',
  'FULL',
  'GROUND',
  'INTERSECTION',
  'LEFT',
  'LENGTH',
  'MONITOR',
  'OF',
  'ON',
  'POINT',
  'POSITION',
  'READY',
  'RIGHT',
  'SHORT',
  'TAXI',
  'TAXIWAY',
  'TAXIWAYS',
  'THE',
  'THEN',
  'TOWER',
  'TURN',
  'TWY',
  'VIA',
  'WHEN',
]);
const RUNWAY_WORDS = new Set(['RUNWAY', 'RUNWAYS', 'RWY']);
/** The words followed by a stand name, which is not a taxiway of the route */
const STAND_WORDS = new Set(['STAND', 'GATE', 'SPOT', 'PARKING']);
/** A runway designator, e.g. 4, 34L */
const RUNWAY_DESIGNATOR = /^\d{1,2}[LCR]?$/;
/** A radio frequency, e.g. 121.7 */
const FREQUENCY = /^\d{3}\.\d+$/;

/** A runway designator with two digits, e.g. 4 -> 04, 34L -> 34L */
function runwayDesignator(designator: string): string {
  return designator.replace(/[^0-9]/g, '').length < 2 ? `0${designator}` : designator;
}

/** A name for comparison: letters and digits only (e.g. "A-4B" and "A4B" are the same name) */
function compactName(name: string): string {
  return name.replace(/[^0-9A-Z]/g, '');
}

/**
 * Reads a taxi clearance typed as a list of taxiways ("A, B K-L") or pasted as ATC says it ("via L4 cross runway 34L,
 * taxi to holding point C1, runway 34R, via L4, A4B, W4, W, A, E, C1"):
 * - the phraseology words, the runway designators, the stand after STAND/GATE and the frequencies are left out; the
 *   runways after CROSS (RUNWAY) are the cleared runway crossings;
 * - the clearance limit (after TO, HOLDING POINT) is the last taxiway, wherever it is said; HOLD SHORT (OF) a taxiway
 *   is a limit before it, so that taxiway is left out;
 * - a name of several words (e.g. SOUTH RAMP), or typed with a separator (A-4B), is the airport taxiway of that name;
 * - a taxiway said twice in a row (C1 as the last taxiway and as the holding point) is one taxiway.
 * @param airportNames the names of the airport taxiways
 */
export function readTaxiClearance(text: string, airportNames: Iterable<string> = []): TaxiClearance {
  const names = new Set<string>();
  const byCompact = new Map<string, string | null>();
  let longest = 1;
  for (const name of airportNames) {
    names.add(name);
    const key = compactName(name);
    // A compact name shared by two airport names is ambiguous: not used
    byCompact.set(key, byCompact.has(key) && byCompact.get(key) !== name ? null : name);
    longest = Math.max(longest, name.split(/\s+/).length);
  }

  // The words, a word with hyphens being an airport name or a list ("K-L")
  const words: string[] = [];
  for (const raw of text.toUpperCase().split(/[\s,;/]+/)) {
    const word = raw.replace(/^[.:()"']+|[.:()"']+$/g, '');
    if (word.length === 0 || FREQUENCY.test(word)) {
      continue;
    }
    const airportName = names.has(word) ? word : byCompact.get(compactName(word));
    if (airportName) {
      words.push(airportName);
    } else {
      words.push(...word.split('-').filter((it) => it.length > 0));
    }
  }

  // The words grouped into names (an airport name of several words is one name, the longest first)
  const units: string[] = [];
  for (let i = 0; i < words.length; ) {
    let n = Math.min(longest, words.length - i);
    while (n > 1 && !names.has(words.slice(i, i + n).join(' '))) {
      n--;
    }
    units.push(words.slice(i, i + n).join(' '));
    i += n;
  }

  const taxiways: string[] = [];
  const crossings: string[] = [];
  let limit: string | null = null;
  /** Designators that follow: of runways to cross, of other runways (e.g. the departure runway), or none */
  let runwayContext: 'cross' | 'runway' | null = null;
  /** What the next taxiway is: the clearance limit, a hold short point (left out), or a taxiway of the route */
  let next: 'limit' | 'holdShort' | 'stand' | null = null;
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    if (names.has(unit) && !(runwayContext !== null && RUNWAY_DESIGNATOR.test(unit))) {
      // An airport taxiway (also when its name is a phraseology word)
      runwayContext = null;
    } else if (unit === 'CROSS') {
      runwayContext = 'cross';
      continue;
    } else if (RUNWAY_WORDS.has(unit)) {
      runwayContext = runwayContext === 'cross' ? 'cross' : 'runway';
      // A runway is the clearance limit after TO, or the hold short point: no taxiway expected any more
      next = null;
      continue;
    } else if (runwayContext !== null && RUNWAY_DESIGNATOR.test(unit)) {
      if (runwayContext === 'cross') {
        crossings.push(runwayDesignator(unit));
      }
      continue;
    } else if (runwayContext !== null && unit === 'AND') {
      continue;
    } else if (unit === 'TO' || unit === 'HOLDING') {
      runwayContext = null;
      next = 'limit';
      continue;
    } else if (unit === 'HOLD') {
      runwayContext = null;
      next = 'holdShort';
      continue;
    } else if (STAND_WORDS.has(unit)) {
      runwayContext = null;
      next = 'stand';
      continue;
    } else if (PHRASEOLOGY.has(unit)) {
      // "cross runway 34L via 5": no runway designator after another word
      runwayContext = null;
      continue;
    } else {
      runwayContext = null;
    }

    switch (next) {
      case 'limit':
        limit = unit;
        break;
      case 'holdShort':
      case 'stand':
        break;
      default:
        taxiways.push(unit);
        break;
    }
    next = null;
  }
  if (limit !== null) {
    taxiways.push(limit);
  }
  return { taxiways: withoutRepeats(taxiways), crossings };
}

/** The names without the ones said twice in a row (C1 C1 is C1) */
function withoutRepeats(names: readonly string[]): string[] {
  return names.filter((name, i) => i === 0 || name !== names[i - 1]);
}

/**
 * The taxiways of a clearance, in order (see {@link readTaxiClearance}).
 * @param airportNames the names of the airport taxiways
 */
export function parseTaxiClearance(text: string, airportNames: Iterable<string> = []): string[] {
  return readTaxiClearance(text, airportNames).taxiways;
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
