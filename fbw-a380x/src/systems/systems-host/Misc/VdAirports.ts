// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AwarenessRunway } from '@flybywiresim/fbw-sdk';

/**
 * An airport the A380X VD draws as flat ground (L:A380X_VD_AIRPORT_*, read by the native VD terrain gauge ndwxr,
 * vd_airports.h): the terrain MapView draws the airport diagram (runways, taxiways, aprons) over the terrain, which the
 * VD would read as terrain far above its plot, so the gauge replaces the stretches of its cut whose band reaches one of
 * these circles with flat ground at the airport's elevation (a design choice: an airport is flat ground). One circle
 * per airport, sized to it, covers the taxiways and aprons between and beside the runways, which rectangles around
 * each runway left as spikes (2026-10-10, user's choice over a fixed radius).
 */
export interface VdAirport {
  /** The centre of the circle, in degrees */
  readonly latitude: number;
  readonly longitude: number;
  /** Its radius, margin included, in nautical miles */
  readonly radiusNm: number;
  /** The highest runway threshold of the airport, in feet */
  readonly elevationFt: number;
}

/**
 * The circle holds every runway corner of the airport, grown by this much for the taxiways and aprons beside and beyond
 * the outer runways (design choice: a parallel taxiway and its apron lie within about 0.3 NM of the runway).
 */
export const VD_AIRPORT_MARGIN_NM = 0.3;

const METRES_PER_NM = 1852;
const FEET_PER_METRE = 3.28084;
const DEG_TO_RAD = Math.PI / 180;

/** A point or a circle centre in a flat frame, in nautical miles */
interface FlatPoint {
  readonly x: number;
  readonly y: number;
}

interface FlatCircle extends FlatPoint {
  readonly r: number;
}

/** A point counts as inside a circle up to this far beyond its edge (rounding), in nautical miles */
const INSIDE_TOLERANCE_NM = 1e-7;

function isInside(p: FlatPoint, c: FlatCircle | null): boolean {
  return c !== null && Math.hypot(p.x - c.x, p.y - c.y) <= c.r + INSIDE_TOLERANCE_NM;
}

function circleOnDiameter(a: FlatPoint, b: FlatPoint): FlatCircle {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: Math.hypot(a.x - b.x, a.y - b.y) / 2 };
}

/** The circle through three points; for (nearly) collinear points the circle on the two farthest apart */
function circleThrough(a: FlatPoint, b: FlatPoint, c: FlatPoint): FlatCircle {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) {
    const candidates = [circleOnDiameter(a, b), circleOnDiameter(a, c), circleOnDiameter(b, c)];
    return candidates.reduce((largest, circle) => (circle.r > largest.r ? circle : largest));
  }
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { x, y, r: Math.hypot(a.x - x, a.y - y) };
}

/**
 * The smallest circle holding all the points (Welzl's incremental construction: when a point lies outside the circle
 * of the points before it, it is on the edge of the new one; the same for a second and a third point).
 * @param points at least one point
 */
export function smallestEnclosingCircle(points: readonly FlatPoint[]): FlatCircle {
  let circle: FlatCircle | null = null;
  for (let i = 0; i < points.length; i++) {
    if (isInside(points[i], circle)) {
      continue;
    }
    circle = { x: points[i].x, y: points[i].y, r: 0 };
    for (let j = 0; j < i; j++) {
      if (isInside(points[j], circle)) {
        continue;
      }
      circle = circleOnDiameter(points[i], points[j]);
      for (let k = 0; k < j; k++) {
        if (!isInside(points[k], circle)) {
          circle = circleThrough(points[i], points[j], points[k]);
        }
      }
    }
  }
  return circle ?? { x: 0, y: 0, r: 0 };
}

/**
 * The VD circles of the airports of a list of runways: one per airport, the smallest circle holding the corners of
 * all its runways plus VD_AIRPORT_MARGIN_NM, at its highest runway threshold.
 * @param runways the runways around the aircraft (NearbyRunwayProvider)
 */
export function vdAirports(runways: readonly AwarenessRunway[]): VdAirport[] {
  const byAirport = new Map<string, AwarenessRunway[]>();
  for (const runway of runways) {
    const list = byAirport.get(runway.airport);
    if (list) {
      list.push(runway);
    } else {
      byAirport.set(runway.airport, [runway]);
    }
  }
  const airports: VdAirport[] = [];
  byAirport.forEach((airportRunways) => {
    // A flat frame around the first runway's centre (an airport spans a few nautical miles)
    const originLatitude = airportRunways[0].latitude;
    const originLongitude = airportRunways[0].longitude;
    const nmPerDegreeLon = 60 * Math.cos(originLatitude * DEG_TO_RAD);
    const corners: FlatPoint[] = [];
    let elevationM = -Infinity;
    for (const runway of airportRunways) {
      const centreX = (runway.longitude - originLongitude) * nmPerDegreeLon;
      const centreY = (runway.latitude - originLatitude) * 60;
      const course = runway.ends[0].course * DEG_TO_RAD;
      const halfLength = runway.length / 2 / METRES_PER_NM;
      const halfWidth = runway.width / 2 / METRES_PER_NM;
      // along the runway (u) and across it (v), east and north components
      const uX = Math.sin(course);
      const uY = Math.cos(course);
      for (const along of [-halfLength, halfLength]) {
        for (const across of [-halfWidth, halfWidth]) {
          corners.push({ x: centreX + along * uX + across * uY, y: centreY + along * uY - across * uX });
        }
      }
      elevationM = Math.max(elevationM, runway.ends[0].elevation, runway.ends[1].elevation);
    }
    const circle = smallestEnclosingCircle(corners);
    airports.push({
      latitude: originLatitude + circle.y / 60,
      longitude: originLongitude + (nmPerDegreeLon > 0 ? circle.x / nmPerDegreeLon : 0),
      radiusNm: circle.r + VD_AIRPORT_MARGIN_NM,
      elevationFt: elevationM * FEET_PER_METRE,
    });
  });
  return airports;
}

/**
 * The airports to publish: the closest ones first (by the distance to the edge of their circle), at most maxCount.
 * @param airports the VD circles of the airports around the aircraft
 * @param latitude the aircraft latitude, in degrees
 * @param longitude the aircraft longitude, in degrees
 * @param maxCount the most airports published
 */
export function closestVdAirports(
  airports: readonly VdAirport[],
  latitude: number,
  longitude: number,
  maxCount: number,
): VdAirport[] {
  const nmPerDegreeLon = 60 * Math.cos(latitude * DEG_TO_RAD);
  const distance = (a: VdAirport) =>
    Math.hypot((a.longitude - longitude) * nmPerDegreeLon, (a.latitude - latitude) * 60) - a.radiusNm;
  return [...airports].sort((a, b) => distance(a) - distance(b)).slice(0, maxCount);
}
