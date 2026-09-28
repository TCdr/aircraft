//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FeatureType } from '../amdb';
import { LandingRunwayCondition } from './landing';

/** Minimum distance from the threshold to the touchdown zone of BTV, in metres (A380 FCOM DSC-32-10-30-20: 1312.3 ft) */
export const BTV_TOUCHDOWN_DISTANCE = 400;

/**
 * The BTV DRY and WET lines of a landing, in metres from the threshold (A380 FCOM DSC-32-10-30-20, dry and wet line):
 * the predicted landing distances that the flight crew uses to choose the runway exit during the descent preparation.
 */
export interface BtvLines {
  touchdown: number;
  /** Dry runway, autobrake HI, no reverser */
  dry: number;
  /** 1/4 in of water, maximum braking, maximum reverse */
  wet: number;
}

/** A runway exit, at its distance from the threshold in metres (where it leaves the runway centreline) */
export interface BtvExit {
  name: string;
  distance: number;
  /** Where the exit leaves the runway centreline, in the airport map projection (metres, x east, y north) */
  start?: [number, number];
}

export enum BtvExitStatus {
  /** The first exit beyond the WET line: the recommended one, even on a dry runway (A380 FCOM PRO-NOR-SOP-160) */
  Recommended = 'RECOMMENDED',
  /** Beyond the WET line: dry or wet runway */
  BeyondWet = 'BEYOND_WET',
  /** Between the DRY and the WET lines: dry runway only */
  DryOnly = 'DRY_ONLY',
  /** Before the DRY line, or before the WET line on a wet runway: not achievable */
  NotAchievable = 'NOT_ACHIEVABLE',
}

export interface BtvExitAssessment extends BtvExit {
  status: BtvExitStatus;
}

/**
 * The runway exits in order, with what BTV can achieve with them: select the exit in accordance with the runway
 * condition, dry or wet, and preferably beyond the WET line even on a dry runway (A380 FCOM PRO-NOR-SOP-160, runway exit).
 * BTV is prohibited on a contaminated runway (LIM-32-30): no assessment then.
 */
export function assessBtvExits(
  exits: readonly BtvExit[],
  lines: BtvLines,
  condition: LandingRunwayCondition,
): BtvExitAssessment[] | null {
  if (!isBtvRunwayCondition(condition)) {
    return null;
  }
  const dry = condition === LandingRunwayCondition.Dry;
  let recommended = false;
  return [...exits]
    .sort((a, b) => a.distance - b.distance)
    .map((exit) => {
      let status: BtvExitStatus;
      if (exit.distance >= lines.wet) {
        status = recommended ? BtvExitStatus.BeyondWet : BtvExitStatus.Recommended;
        recommended = true;
      } else if (dry && exit.distance >= lines.dry) {
        status = BtvExitStatus.DryOnly;
      } else {
        status = BtvExitStatus.NotAchievable;
      }
      return { ...exit, status };
    });
}

/** BTV must be used only on dry and wet runways (A380 FCOM LIM-32-30) */
export function isBtvRunwayCondition(condition: LandingRunwayCondition): boolean {
  return condition === LandingRunwayCondition.Dry || condition === LandingRunwayCondition.Wet;
}

/** A feature of the airport mapping database (GeoJSON, in the airport projection, in metres) */
export interface BtvAmdbFeature {
  properties: { feattype?: number; idthr?: string; idrwy?: string; idlin?: string };
  geometry: { type: string; coordinates: unknown };
}

type Point = [number, number];

/** Runway designators with two digits: 6 -> 06, 6L -> 06L */
function padDesignator(designator: string): string {
  return designator.replace(/[^0-9]/g, '').length < 2 ? `0${designator}` : designator;
}

/**
 * The exits of a runway, from the airport mapping database, as the OANS finds them for BTV (OansBrakeToVacateSelection):
 * exit lines that start on the runway (within 50 m of its centreline), at least 400 m after the threshold, and do not
 * turn back (within 120° of the landing direction). The distance is measured along the runway from the threshold.
 * @returns the exits in order, or null when the runway is not in the data
 */
export function runwayExitsFromAmdb(features: readonly BtvAmdbFeature[], runway: string): BtvExit[] | null {
  const ident = padDesignator(runway);
  const threshold = features.find(
    (f) =>
      f.properties.feattype === FeatureType.RunwayThreshold &&
      f.properties.idthr !== undefined &&
      padDesignator(f.properties.idthr) === ident,
  );
  const centreline = features.find(
    (f) =>
      f.properties.feattype === FeatureType.PaintedCenterline &&
      (f.properties.idrwy ?? '').split('.').map(padDesignator).includes(ident),
  );
  if (threshold === undefined || centreline === undefined || threshold.geometry.type !== 'Point') {
    return null;
  }
  const thr = threshold.geometry.coordinates as Point;
  const line = centreline.geometry.coordinates as Point[];
  const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const first = line[0];
  const last = line[line.length - 1];
  const end = distance(thr, first) > distance(thr, last) ? first : last;
  const length = distance(thr, end);
  if (length < 1) {
    return null;
  }
  // Unit vector of the landing direction, and the along-track and cross-track distances of a point
  const ux = (end[0] - thr[0]) / length;
  const uy = (end[1] - thr[1]) / length;
  const along = (p: Point) => (p[0] - thr[0]) * ux + (p[1] - thr[1]) * uy;
  const across = (p: Point) => Math.abs((p[0] - thr[0]) * uy - (p[1] - thr[1]) * ux);

  const exits = new Map<string, { distance: number; start: Point }>();
  for (const f of features) {
    if (f.properties.feattype !== FeatureType.RunwayExitLine || f.properties.idlin === undefined) {
      continue;
    }
    const coordinates = f.geometry.coordinates as Point[];
    if (f.geometry.type !== 'LineString' || coordinates.length < 2) {
      continue;
    }
    // The start of the exit is its end nearest to the centreline, the next point gives its direction
    const fromFirst = across(coordinates[0]) <= across(coordinates[coordinates.length - 1]);
    const start = fromFirst ? coordinates[0] : coordinates[coordinates.length - 1];
    const next = fromFirst ? coordinates[1] : coordinates[coordinates.length - 2];
    const dx = next[0] - start[0];
    const dy = next[1] - start[1];
    const segment = Math.hypot(dx, dy);
    const turn =
      segment > 0 ? (Math.acos(Math.max(-1, Math.min(1, (dx * ux + dy * uy) / segment))) * 180) / Math.PI : 0;
    const s = along(start);
    if (across(start) > 50 || s < BTV_TOUCHDOWN_DISTANCE || s > length || turn > 120) {
      continue;
    }
    const known = exits.get(f.properties.idlin);
    if (known === undefined || s < known.distance) {
      exits.set(f.properties.idlin, { distance: s, start });
    }
  }
  const result: BtvExit[] = [];
  exits.forEach((exit, name) => result.push({ name, distance: exit.distance, start: exit.start }));
  return result.sort((a, b) => a.distance - b.distance);
}
