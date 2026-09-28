// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** A point of the airport map, in metres from the aerodrome reference point: x east, y north */
export type TaxiPoint = [number, number];

/** What a line of the airport map guides the aircraft along */
export enum TaxiLineKind {
  /** A taxiway guidance line (ED-99 taxiway guidance line), named by its taxiway */
  Taxiway = 'TAXIWAY',
  /** A runway exit line, named by its exit */
  Exit = 'EXIT',
  /** A stand guidance line, the lead-in line of a parking stand */
  Stand = 'STAND',
  /**
   * A runway centreline: it splits the taxi lines that cross the runway (to find the runway entries), but a taxi route
   * never follows it
   */
  Runway = 'RUNWAY',
}

export interface TaxiLine {
  kind: TaxiLineKind;
  /** The taxiway or exit name (upper case), null when the line has none */
  name: string | null;
  points: TaxiPoint[];
}

export interface TaxiEdge {
  from: number;
  to: number;
  /** metres */
  length: number;
  /** Index of the line the edge is part of */
  line: number;
}

/** The taxi network: the guidance lines of the airport map, split and joined where they meet */
export interface TaxiNetwork {
  lines: TaxiLine[];
  nodes: TaxiPoint[];
  edges: TaxiEdge[];
  /** For each node, the indices of its edges */
  adjacency: number[][];
}

/** Line ends closer than this to another line are joined to it, in metres */
export const TAXI_NETWORK_SNAP = 3;

/**
 * A dead end of a part of the network that is not connected to the rest is joined to the nearest line of another part
 * within this distance, in metres (airport maps where a lead-in line stops short of the apron taxi line)
 */
export const TAXI_NETWORK_GAP = 15;

const CELL = 50;

interface Segment {
  line: number;
  a: TaxiPoint;
  b: TaxiPoint;
  /** Where the segment is split, as fractions of its length */
  splits: number[];
}

/** Normalises a taxiway or exit name of the airport map */
export function taxiName(name: string | null | undefined): string | null {
  const n = (name ?? '').trim().toUpperCase();
  return n.length > 0 ? n : null;
}

export function taxiDistance(a: TaxiPoint, b: TaxiPoint): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** The point of segment ab nearest to p, as the fraction t along the segment and the distance to it */
export function nearestOnSegment(p: TaxiPoint, a: TaxiPoint, b: TaxiPoint): { t: number; distance: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return { t, distance: Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]) };
}

function lerp(a: TaxiPoint, b: TaxiPoint, t: number): TaxiPoint {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Fractions along ab and cd where the two segments cross, or null */
function crossing(a: TaxiPoint, b: TaxiPoint, c: TaxiPoint, d: TaxiPoint): [number, number] | null {
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
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
}

/** A grid of cells of CELL metres, to find what is near a point quickly */
class Grid<T> {
  private readonly cells = new Map<string, T[]>();

  add(minX: number, minY: number, maxX: number, maxY: number, item: T): void {
    for (let i = Math.floor(minX / CELL); i <= Math.floor(maxX / CELL); i++) {
      for (let j = Math.floor(minY / CELL); j <= Math.floor(maxY / CELL); j++) {
        const key = `${i},${j}`;
        const cell = this.cells.get(key);
        if (cell) {
          cell.push(item);
        } else {
          this.cells.set(key, [item]);
        }
      }
    }
  }

  near(minX: number, minY: number, maxX: number, maxY: number): Set<T> {
    const found = new Set<T>();
    for (let i = Math.floor(minX / CELL); i <= Math.floor(maxX / CELL); i++) {
      for (let j = Math.floor(minY / CELL); j <= Math.floor(maxY / CELL); j++) {
        this.cells.get(`${i},${j}`)?.forEach((it) => found.add(it));
      }
    }
    return found;
  }
}

/**
 * Builds the taxi network of an airport from its guidance lines: every line is split where it crosses another one, and
 * a line that ends within {@link TAXI_NETWORK_SNAP} metres of another line is joined to it (T junctions).
 */
export function buildTaxiNetwork(lines: readonly TaxiLine[]): TaxiNetwork {
  const segments: Segment[] = [];
  const grid = new Grid<Segment>();
  lines.forEach((line, index) => {
    for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1];
      const b = line.points[i];
      if (taxiDistance(a, b) < 0.01) {
        continue;
      }
      const segment: Segment = { line: index, a, b, splits: [0, 1] };
      segments.push(segment);
      grid.add(
        Math.min(a[0], b[0]) - TAXI_NETWORK_SNAP,
        Math.min(a[1], b[1]) - TAXI_NETWORK_SNAP,
        Math.max(a[0], b[0]) + TAXI_NETWORK_SNAP,
        Math.max(a[1], b[1]) + TAXI_NETWORK_SNAP,
        segment,
      );
    }
  });

  // Crossings between segments
  const done = new Set<string>();
  const indexOf = new Map<Segment, number>(segments.map((s, i) => [s, i]));
  for (const s of segments) {
    const i = indexOf.get(s) as number;
    for (const o of grid.near(
      Math.min(s.a[0], s.b[0]),
      Math.min(s.a[1], s.b[1]),
      Math.max(s.a[0], s.b[0]),
      Math.max(s.a[1], s.b[1]),
    )) {
      const j = indexOf.get(o) as number;
      if (j <= i) {
        continue;
      }
      const key = `${i},${j}`;
      if (done.has(key)) {
        continue;
      }
      done.add(key);
      const c = crossing(s.a, s.b, o.a, o.b);
      if (c) {
        s.splits.push(c[0]);
        o.splits.push(c[1]);
      }
    }
  }

  // Line ends near another line: split that line there and join them
  const joins: [TaxiPoint, TaxiPoint][] = [];
  lines.forEach((line, index) => {
    if (line.points.length < 2) {
      return;
    }
    for (const end of [line.points[0], line.points[line.points.length - 1]]) {
      for (const o of grid.near(end[0], end[1], end[0], end[1])) {
        if (o.line === index) {
          continue;
        }
        const { t, distance } = nearestOnSegment(end, o.a, o.b);
        if (distance <= TAXI_NETWORK_SNAP) {
          o.splits.push(t);
          joins.push([end, lerp(o.a, o.b, t)]);
        }
      }
    }
  });

  const network: TaxiNetwork = { lines: [...lines], nodes: [], edges: [], adjacency: [] };
  const nodeGrid = new Grid<number>();
  const node = (p: TaxiPoint): number => {
    for (const n of nodeGrid.near(p[0] - 0.5, p[1] - 0.5, p[0] + 0.5, p[1] + 0.5)) {
      if (taxiDistance(network.nodes[n], p) < 0.5) {
        return n;
      }
    }
    network.nodes.push(p);
    network.adjacency.push([]);
    const n = network.nodes.length - 1;
    nodeGrid.add(p[0], p[1], p[0], p[1], n);
    return n;
  };
  const edge = (from: number, to: number, line: number) => {
    if (from === to) {
      return;
    }
    const length = taxiDistance(network.nodes[from], network.nodes[to]);
    network.edges.push({ from, to, length, line });
    network.adjacency[from].push(network.edges.length - 1);
    network.adjacency[to].push(network.edges.length - 1);
  };

  for (const s of segments) {
    const splits = [...new Set(s.splits)].sort((a, b) => a - b);
    let previous = node(lerp(s.a, s.b, splits[0]));
    for (let k = 1; k < splits.length; k++) {
      const next = node(lerp(s.a, s.b, splits[k]));
      edge(previous, next, s.line);
      previous = next;
    }
  }
  // A join belongs to the line that ends there
  for (const [end, on] of joins) {
    const a = node(end);
    const b = node(on);
    const first = network.adjacency[a][0];
    if (first !== undefined) {
      edge(a, b, network.edges[first].line);
    }
  }
  joinGaps(network);
  return network;
}

/** The connected parts of the network, without the runway centrelines (a taxi route never follows them) */
function networkParts(network: TaxiNetwork): { part: number[]; degree: number[] } {
  const part = network.nodes.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (part[r] !== r) {
      r = part[r];
    }
    while (part[i] !== r) {
      const next = part[i];
      part[i] = r;
      i = next;
    }
    return r;
  };
  const degree = network.nodes.map(() => 0);
  for (const e of network.edges) {
    if (network.lines[e.line].kind !== TaxiLineKind.Runway) {
      part[find(e.from)] = find(e.to);
      degree[e.from]++;
      degree[e.to]++;
    }
  }
  return { part: part.map((_, i) => find(i)), degree };
}

/**
 * Joins each dead end of a part of the network to the nearest taxi line of another part within
 * {@link TAXI_NETWORK_GAP} metres (splitting that line there), so that a gap in the airport map does not cut the parts
 * apart. Dead ends near a line of their own part are left alone (no shortcuts).
 */
function joinGaps(network: TaxiNetwork): void {
  const { part, degree } = networkParts(network);
  const find = (i: number): number => {
    while (part[i] !== i) {
      i = part[i];
    }
    return i;
  };
  const edgeGrid = new Grid<number>();
  network.edges.forEach((e, i) => {
    if (network.lines[e.line].kind === TaxiLineKind.Runway) {
      return;
    }
    const a = network.nodes[e.from];
    const b = network.nodes[e.to];
    edgeGrid.add(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), i);
  });
  /** The nearest line of another part to a dead end, within the gap distance */
  const nearestOtherPart = (n: number): { edge: number; t: number; distance: number } | null => {
    const p = network.nodes[n];
    let best: { edge: number; t: number; distance: number } | null = null;
    for (const ei of edgeGrid.near(
      p[0] - TAXI_NETWORK_GAP,
      p[1] - TAXI_NETWORK_GAP,
      p[0] + TAXI_NETWORK_GAP,
      p[1] + TAXI_NETWORK_GAP,
    )) {
      const e = network.edges[ei];
      if (find(e.from) === find(n)) {
        continue;
      }
      const near = nearestOnSegment(p, network.nodes[e.from], network.nodes[e.to]);
      if (near.distance <= TAXI_NETWORK_GAP && (best === null || near.distance < best.distance)) {
        best = { edge: ei, ...near };
      }
    }
    return best;
  };
  // The smallest gaps first: a lead-in line joins its own apron line rather than the one of the next stand
  const gaps: { node: number; distance: number }[] = [];
  network.nodes.forEach((_, n) => {
    const best = degree[n] === 1 ? nearestOtherPart(n) : null;
    if (best !== null) {
      gaps.push({ node: n, distance: best.distance });
    }
  });
  gaps.sort((x, y) => x.distance - y.distance);
  for (const gap of gaps) {
    const n = gap.node;
    const p = network.nodes[n];
    const best = nearestOtherPart(n);
    if (best === null) {
      continue;
    }
    const e = network.edges[best.edge];
    // The join point: an end of the edge, or a new node that splits it
    let joined: number;
    if (best.t <= 0.001) {
      joined = e.from;
    } else if (best.t >= 0.999) {
      joined = e.to;
    } else {
      network.nodes.push(lerp(network.nodes[e.from], network.nodes[e.to], best.t));
      network.adjacency.push([]);
      joined = network.nodes.length - 1;
      part.push(find(e.from));
      const to = e.to;
      e.to = joined;
      e.length = taxiDistance(network.nodes[e.from], network.nodes[joined]);
      network.adjacency[to].splice(network.adjacency[to].indexOf(best.edge), 1);
      network.adjacency[joined].push(best.edge);
      const second = { from: joined, to, length: taxiDistance(network.nodes[joined], network.nodes[to]), line: e.line };
      network.edges.push(second);
      network.adjacency[joined].push(network.edges.length - 1);
      network.adjacency[to].push(network.edges.length - 1);
      edgeGrid.add(
        Math.min(network.nodes[joined][0], network.nodes[to][0]),
        Math.min(network.nodes[joined][1], network.nodes[to][1]),
        Math.max(network.nodes[joined][0], network.nodes[to][0]),
        Math.max(network.nodes[joined][1], network.nodes[to][1]),
        network.edges.length - 1,
      );
    }
    // The join belongs to the line of the dead end
    const own =
      network.edges[
        network.adjacency[n].find((i) => network.lines[network.edges[i].line].kind !== TaxiLineKind.Runway) as number
      ];
    network.edges.push({ from: n, to: joined, length: taxiDistance(p, network.nodes[joined]), line: own.line });
    network.adjacency[n].push(network.edges.length - 1);
    network.adjacency[joined].push(network.edges.length - 1);
    part[find(n)] = find(joined);
  }
}
