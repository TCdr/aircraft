// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { TaxiLine, TaxiLineKind, TaxiPoint } from './taxiNetwork';

/** How a taxi line of the airport map suits the aircraft */
export enum TaxiLineFit {
  /** Wide enough (or cleared for the wingspan by the airport map) */
  Suitable = 'SUITABLE',
  /** Narrower than the aircraft needs, or for smaller wingspans only */
  TooNarrow = 'TOO_NARROW',
  /** No data: neither a wingspan limit nor a pavement under the line in the airport map */
  Unverified = 'UNVERIFIED',
}

/** What the aircraft needs from a taxiway */
export interface TaxiAircraftSize {
  /** metres */
  wingspan: number;
  /** The taxiway width of its aerodrome reference code letter, metres */
  taxiwayWidth: number;
}

/**
 * The A380: wingspan 79.75 m, aerodrome reference code letter F. ICAO Annex 14 Volume I, 3.9.3 (taxiway width of the
 * straight portion of a taxiway): "Code letter F: 25 m".
 */
export const TAXI_A380: TaxiAircraftSize = { wingspan: 79.75, taxiwayWidth: 25 };

/** A taxi line as the aircraft sees it: its fit, and the data it comes from */
export interface TaxiLineFitInfo {
  fit: TaxiLineFit;
  /** The pavement width measured under the line, metres (null when not measured or no pavement found) */
  width: number | null;
  /** The largest wingspan the airport map clears the line for, metres (null when the map does not say) */
  wingspan: number | null;
}

/**
 * A measured width this much below the required one is accepted, metres: the airport map polygons are not exact (and a
 * curve of the line moves the probe off the perpendicular)
 */
const WIDTH_TOLERANCE = 1;
/** The pavement is looked for up to this distance on each side of the line, metres: farther is an apron */
const PROBE_HALF_LENGTH = 60;
/** The samples along a line keep this far from its ends (the fillets of a junction are wider), metres */
const SAMPLE_END_MARGIN = 20;
/** The samples along a line are about this far apart, metres */
const SAMPLE_SPACING = 30;
/** Pavement polygons closer than this along the probe are one pavement (shared edges of adjacent elements), metres */
const TOUCH = 0.05;
/** The grid cell of the pavement index, metres */
const CELL = 100;

/** The pavement of the airport (taxiway, apron and runway elements), indexed to find what is near a point */
export interface TaxiPavement {
  /** Each polygon with its rings (the outer ring, then its holes) */
  polygons: TaxiPoint[][][];
  /** Bounding boxes of the polygons: minX, minY, maxX, maxY */
  boxes: [number, number, number, number][];
  cells: Map<string, number[]>;
}

/** Indexes the pavement polygons (each one: its outer ring, then its holes) */
export function taxiPavement(polygons: TaxiPoint[][][]): TaxiPavement {
  const pavement: TaxiPavement = { polygons: [], boxes: [], cells: new Map() };
  for (const rings of polygons) {
    const outer = rings[0];
    if (!outer || outer.length < 3) {
      continue;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of outer) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const index = pavement.polygons.length;
    pavement.polygons.push(rings);
    pavement.boxes.push([minX, minY, maxX, maxY]);
    for (let i = Math.floor(minX / CELL); i <= Math.floor(maxX / CELL); i++) {
      for (let j = Math.floor(minY / CELL); j <= Math.floor(maxY / CELL); j++) {
        const key = `${i},${j}`;
        const cell = pavement.cells.get(key);
        if (cell) {
          cell.push(index);
        } else {
          pavement.cells.set(key, [index]);
        }
      }
    }
  }
  return pavement;
}

/**
 * The width of the pavement under a point of a taxi line, across the line: the stretch of the probe (the perpendicular
 * to the line through the point, PROBE_HALF_LENGTH each side) inside the pavement polygons and containing the point.
 * Adjacent polygons are one pavement; holes are not pavement. Null when the point is not on the pavement.
 * @param direction the direction of the line at the point (any length)
 */
export function taxiPavementWidth(pavement: TaxiPavement, point: TaxiPoint, direction: TaxiPoint): number | null {
  const length = Math.hypot(direction[0], direction[1]);
  if (length === 0) {
    return null;
  }
  // d along the line, n across it: the probe is the points p + s * n
  const dx = direction[0] / length;
  const dy = direction[1] / length;
  const nx = -dy;
  const ny = dx;
  const reach = PROBE_HALF_LENGTH;
  const x0 = Math.min(point[0] - nx * reach, point[0] + nx * reach);
  const x1 = Math.max(point[0] - nx * reach, point[0] + nx * reach);
  const y0 = Math.min(point[1] - ny * reach, point[1] + ny * reach);
  const y1 = Math.max(point[1] - ny * reach, point[1] + ny * reach);

  const candidates = new Set<number>();
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
    for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++) {
      for (const index of pavement.cells.get(`${i},${j}`) ?? []) {
        const [bx0, by0, bx1, by1] = pavement.boxes[index];
        if (bx0 <= x1 && bx1 >= x0 && by0 <= y1 && by1 >= y0) {
          candidates.add(index);
        }
      }
    }
  }

  // The stretches of the probe inside each polygon: where its edges cross the probe line, in pairs (even-odd rule)
  const inside: [number, number][] = [];
  candidates.forEach((index) => {
    const crossings: number[] = [];
    for (const ring of pavement.polygons[index]) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[j];
        const b = ring[i];
        // Signed distances along the line: the edge crosses the probe line where they change sign (half-open, so an
        // edge on the probe line or a vertex on it counts once)
        const fa = (a[0] - point[0]) * dx + (a[1] - point[1]) * dy;
        const fb = (b[0] - point[0]) * dx + (b[1] - point[1]) * dy;
        if (fa > 0 !== fb > 0) {
          const t = fa / (fa - fb);
          const qx = a[0] + (b[0] - a[0]) * t;
          const qy = a[1] + (b[1] - a[1]) * t;
          crossings.push((qx - point[0]) * nx + (qy - point[1]) * ny);
        }
      }
    }
    crossings.sort((p, q) => p - q);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      inside.push([crossings[i], crossings[i + 1]]);
    }
  });

  // The stretches joined where the polygons touch, and the one at the point
  inside.sort((p, q) => p[0] - q[0]);
  let current: [number, number] | null = null;
  for (const [from, to] of inside) {
    if (current !== null && from <= current[1] + TOUCH) {
      current[1] = Math.max(current[1], to);
      continue;
    }
    if (current !== null && current[0] <= TOUCH && current[1] >= -TOUCH) {
      break;
    }
    current = [from, to];
  }
  if (current === null || current[0] > TOUCH || current[1] < -TOUCH) {
    return null;
  }
  return Math.min(current[1], reach) - Math.max(current[0], -reach);
}

/**
 * The narrowest pavement width under a taxi line: measured every SAMPLE_SPACING, away from its ends (the junction
 * fillets), at its middle when it is short. Null when no sample is on the pavement.
 */
export function taxiLineWidth(pavement: TaxiPavement, points: readonly TaxiPoint[]): number | null {
  const lengths: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = lengths[lengths.length - 1];
  if (points.length < 2 || total <= 0) {
    return null;
  }
  const along: number[] = [];
  if (total <= 2 * SAMPLE_END_MARGIN) {
    along.push(total / 2);
  } else {
    const span = total - 2 * SAMPLE_END_MARGIN;
    const count = Math.ceil(span / SAMPLE_SPACING);
    for (let k = 0; k <= count; k++) {
      along.push(SAMPLE_END_MARGIN + (span * k) / count);
    }
  }
  let narrowest: number | null = null;
  let segment = 1;
  for (const s of along) {
    while (segment < points.length - 1 && lengths[segment] < s) {
      segment++;
    }
    const a = points[segment - 1];
    const b = points[segment];
    const piece = lengths[segment] - lengths[segment - 1];
    const t = piece > 0 ? (s - lengths[segment - 1]) / piece : 0;
    const width = taxiPavementWidth(
      pavement,
      [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
      [b[0] - a[0], b[1] - a[1]],
    );
    if (width !== null && (narrowest === null || width < narrowest)) {
      narrowest = width;
    }
  }
  return narrowest;
}

/**
 * How each taxi line suits the aircraft:
 * - the wingspan limit of the line in the airport map (ED-99 guidance line attribute "wingspan") when it has one;
 * - else the pavement width under the line against the taxiway width of the aircraft code letter;
 * - else unverified (not treated as unsafe).
 * Runway centrelines are not taxi lines: suitable.
 */
export function taxiLineFits(
  lines: readonly TaxiLine[],
  pavement: TaxiPavement,
  aircraft: TaxiAircraftSize,
): TaxiLineFitInfo[] {
  return lines.map((line) => {
    if (line.kind === TaxiLineKind.Runway) {
      return { fit: TaxiLineFit.Suitable, width: null, wingspan: null };
    }
    if (line.wingspan !== undefined && line.wingspan > 0) {
      return {
        fit: line.wingspan >= aircraft.wingspan ? TaxiLineFit.Suitable : TaxiLineFit.TooNarrow,
        width: null,
        wingspan: line.wingspan,
      };
    }
    const width = taxiLineWidth(pavement, line.points);
    if (width === null) {
      return { fit: TaxiLineFit.Unverified, width: null, wingspan: null };
    }
    return {
      fit: width >= aircraft.taxiwayWidth - WIDTH_TOLERANCE ? TaxiLineFit.Suitable : TaxiLineFit.TooNarrow,
      width,
      wingspan: null,
    };
  });
}

/** The indices of the lines too narrow for the aircraft, for the taxi route to avoid */
export function taxiTooNarrowLines(fits: readonly TaxiLineFitInfo[]): Set<number> {
  const lines = new Set<number>();
  fits.forEach((f, i) => f.fit === TaxiLineFit.TooNarrow && lines.add(i));
  return lines;
}

/**
 * The A380 airport check: the share (0 to 1) of the length of the taxi lines (taxiway and runway exit lines; not the
 * stand lines nor the runway centrelines) too narrow for the aircraft. The lines not verified count in the total, not as
 * too narrow. Null when the airport map has no taxi line.
 * Airbus A380 Airport Characteristics (AC, Dec 01/25) 3-3-3: "A380 can operate on aerodromes classified as code 4F as
 * per ICAO Aerodrome Reference Code. It can also operate on aerodromes classified as code 4E provided that specific
 * conditions are met." A large share shows a code E airport (taxiways of 23 m, ICAO Annex 14 Volume I 3.9.3).
 * @param fits the fits of the lines, in the same order (see taxiLineFits)
 */
export function taxiTooNarrowShare(lines: readonly TaxiLine[], fits: readonly TaxiLineFitInfo[]): number | null {
  let total = 0;
  let tooNarrow = 0;
  lines.forEach((line, i) => {
    if (line.kind !== TaxiLineKind.Taxiway && line.kind !== TaxiLineKind.Exit) {
      return;
    }
    let length = 0;
    for (let p = 1; p < line.points.length; p++) {
      length += Math.hypot(line.points[p][0] - line.points[p - 1][0], line.points[p][1] - line.points[p - 1][1]);
    }
    total += length;
    if (fits[i]?.fit === TaxiLineFit.TooNarrow) {
      tooNarrow += length;
    }
  });
  return total > 0 ? tooNarrow / total : null;
}
