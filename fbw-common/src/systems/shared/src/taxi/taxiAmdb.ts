// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FeatureType } from '../amdb';
import { TaxiLine, TaxiLineKind, taxiName, TaxiPoint } from './taxiNetwork';
import { TaxiRunway } from './taxiRoute';
import { TaxiRunwayAxis } from './taxiDeparture';

/** A feature of the airport mapping database (GeoJSON, in the airport projection: metres, x east, y north) */
export interface TaxiAmdbFeature {
  properties: { feattype?: number; idlin?: string; idstd?: string; idrwy?: string; idthr?: string; termref?: string };
  geometry: { type: string; coordinates: unknown };
}

/** A parking stand of the airport map */
export interface TaxiStand {
  name: string;
  /** The terminal or apron it belongs to, when known */
  terminal: string | null;
  point: TaxiPoint;
}

/** The polygons to draw the airport: outer rings only */
export interface TaxiMapShapes {
  runways: TaxiPoint[][];
  taxiways: TaxiPoint[][];
  aprons: TaxiPoint[][];
}

function lineStrings(f: TaxiAmdbFeature): TaxiPoint[][] {
  switch (f.geometry.type) {
    case 'LineString':
      return [f.geometry.coordinates as TaxiPoint[]];
    case 'MultiLineString':
      return f.geometry.coordinates as TaxiPoint[][];
    default:
      return [];
  }
}

function outerRings(f: TaxiAmdbFeature): TaxiPoint[][] {
  switch (f.geometry.type) {
    case 'Polygon':
      return [(f.geometry.coordinates as TaxiPoint[][])[0]].filter((it) => it !== undefined);
    case 'MultiPolygon':
      return (f.geometry.coordinates as TaxiPoint[][][]).map((p) => p[0]).filter((it) => it !== undefined);
    default:
      return [];
  }
}

/**
 * The guidance lines of the airport map: taxiway guidance lines (named by their taxiway), runway exit lines (named by
 * their exit), stand guidance lines (named by their stand) and the runway centrelines.
 */
export function taxiLinesFromAmdb(features: readonly TaxiAmdbFeature[]): TaxiLine[] {
  const lines: TaxiLine[] = [];
  for (const f of features) {
    let kind: TaxiLineKind;
    let name: string | null;
    switch (f.properties.feattype) {
      case FeatureType.TaxiwayGuidanceLine:
        kind = TaxiLineKind.Taxiway;
        name = taxiName(f.properties.idlin);
        break;
      case FeatureType.RunwayExitLine:
        kind = TaxiLineKind.Exit;
        name = taxiName(f.properties.idlin);
        break;
      case FeatureType.StandGuidanceLine:
        kind = TaxiLineKind.Stand;
        name = taxiName(f.properties.idstd ?? f.properties.idlin);
        break;
      case FeatureType.PaintedCenterline:
        kind = TaxiLineKind.Runway;
        name = taxiName(f.properties.idrwy);
        break;
      default:
        continue;
    }
    for (const points of lineStrings(f)) {
      if (points.length >= 2) {
        lines.push({ kind, name, points });
      }
    }
  }
  return lines;
}

/** The parking stands of the airport map, sorted by name */
export function taxiStandsFromAmdb(features: readonly TaxiAmdbFeature[]): TaxiStand[] {
  const stands = new Map<string, TaxiStand>();
  for (const f of features) {
    const name = taxiName(f.properties.idstd);
    if (f.properties.feattype !== FeatureType.ParkingStandLocation || name === null || stands.has(name)) {
      continue;
    }
    let point: TaxiPoint | null = null;
    if (f.geometry.type === 'Point') {
      point = f.geometry.coordinates as TaxiPoint;
    } else if (f.geometry.type === 'MultiPoint') {
      point = (f.geometry.coordinates as TaxiPoint[])[0] ?? null;
    }
    if (point !== null) {
      stands.set(name, { name, terminal: taxiName(f.properties.termref), point });
    }
  }
  return [...stands.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** A stand name for comparison: letters and digits only, without leading zeros (e.g. "016", "16 " and "1-6" -> "16") */
function standKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/(^|[^0-9])0+(?=[0-9])/g, '$1');
}

/** The stand with this name, also when it is typed without the zeros or separators of the airport map */
export function taxiFindStand(stands: readonly TaxiStand[], text: string): TaxiStand | null {
  const name = taxiName(text);
  if (name === null) {
    return null;
  }
  const key = standKey(name);
  return stands.find((s) => s.name === name) ?? stands.find((s) => standKey(s.name) === key) ?? null;
}

/** The stands whose name starts with the typed text, then those that contain it */
export function taxiStandMatches(stands: readonly TaxiStand[], text: string, max: number): TaxiStand[] {
  const key = standKey(text);
  if (key.length === 0) {
    return [];
  }
  const starting = stands.filter((s) => standKey(s.name).startsWith(key));
  const containing = stands.filter((s) => !standKey(s.name).startsWith(key) && standKey(s.name).includes(key));
  return starting.concat(containing).slice(0, max);
}

/** The runways of the airport map, e.g. 09R/27L, as polygons */
export function taxiRunwaysFromAmdb(features: readonly TaxiAmdbFeature[]): TaxiRunway[] {
  const runways = new Map<string, TaxiRunway>();
  for (const f of features) {
    if (f.properties.feattype !== FeatureType.RunwayElement || !f.properties.idrwy) {
      continue;
    }
    const name = f.properties.idrwy
      .split('.')
      .map((it) => (it.replace(/[^0-9]/g, '').length < 2 ? `0${it}` : it))
      .join('/');
    const runway = runways.get(name) ?? { name, polygons: [] };
    runway.polygons.push(...outerRings(f));
    runways.set(name, runway);
  }
  return [...runways.values()];
}

/** The shapes of the runways, taxiways and aprons, to draw the airport */
export function taxiMapShapesFromAmdb(features: readonly TaxiAmdbFeature[]): TaxiMapShapes {
  const shapes: TaxiMapShapes = { runways: [], taxiways: [], aprons: [] };
  for (const f of features) {
    switch (f.properties.feattype) {
      case FeatureType.RunwayElement:
        shapes.runways.push(...outerRings(f));
        break;
      case FeatureType.TaxiwayElement:
        shapes.taxiways.push(...outerRings(f));
        break;
      case FeatureType.ApronElement:
        shapes.aprons.push(...outerRings(f));
        break;
      default:
        break;
    }
  }
  return shapes;
}

function padDesignator(designator: string): string {
  return designator.replace(/[^0-9]/g, '').length < 2 ? `0${designator}` : designator;
}

/** The runway directions of the airport map: each threshold, and the far end of its runway centreline */
export function taxiRunwayAxesFromAmdb(features: readonly TaxiAmdbFeature[]): TaxiRunwayAxis[] {
  const axes: TaxiRunwayAxis[] = [];
  for (const t of features) {
    if (t.properties.feattype !== FeatureType.RunwayThreshold || !t.properties.idthr || t.geometry.type !== 'Point') {
      continue;
    }
    const ident = padDesignator(t.properties.idthr);
    const threshold = t.geometry.coordinates as TaxiPoint;
    if (axes.some((a) => a.ident === ident)) {
      continue;
    }
    // The centreline can be in several pieces (split at runway intersections): its end is the point farthest away
    const d = (p: TaxiPoint) => Math.hypot(p[0] - threshold[0], p[1] - threshold[1]);
    let end: TaxiPoint | null = null;
    for (const f of features) {
      if (
        f.properties.feattype !== FeatureType.PaintedCenterline ||
        !(f.properties.idrwy ?? '').split('.').map(padDesignator).includes(ident)
      ) {
        continue;
      }
      for (const line of lineStrings(f)) {
        for (const p of line) {
          if (end === null || d(p) > d(end)) {
            end = p;
          }
        }
      }
    }
    if (end !== null && d(end) > 100) {
      axes.push({ ident, threshold, end });
    }
  }
  return axes.sort((a, b) => a.ident.localeCompare(b.ident));
}

/** The runway holding position lines of the airport map */
export function taxiHoldingLinesFromAmdb(features: readonly TaxiAmdbFeature[]): TaxiPoint[][] {
  const lines: TaxiPoint[][] = [];
  for (const f of features) {
    if (f.properties.feattype === FeatureType.TaxiwayHoldingPosition) {
      lines.push(...lineStrings(f).filter((it) => it.length >= 2));
    }
  }
  return lines;
}
