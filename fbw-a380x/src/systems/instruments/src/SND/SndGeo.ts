// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** A point in degrees */
export interface SndPoint {
  lat: number;
  lon: number;
}

/** Earth radius in NM */
const EARTH_RADIUS = 3440.065;

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** 0 to 360 */
export const normalizeBearing = (bearing: number) => ((bearing % 360) + 360) % 360;

/** Great circle distance in NM */
export function sndDistance(a: SndPoint, b: SndPoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial true bearing of the great circle from a to b, 0 to 360 */
export function sndBearing(a: SndPoint, b: SndPoint): number {
  const dLon = rad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLon);
  return normalizeBearing(deg(Math.atan2(y, x)));
}

/**
 * The aircraft against the great circle leg from `from` to `to`: cross-track distance (NM, positive right of the
 * leg), along-track distance from `from` (NM), and the desired track at the abeam point (true, degrees)
 */
export function sndLegGuidance(
  from: SndPoint,
  to: SndPoint,
  aircraft: SndPoint,
): { crossTrack: number; alongTrack: number; desiredTrack: number } {
  const d13 = sndDistance(from, aircraft) / EARTH_RADIUS;
  const theta13 = rad(sndBearing(from, aircraft));
  const theta12 = rad(sndBearing(from, to));
  const crossTrack = Math.asin(Math.sin(d13) * Math.sin(theta13 - theta12));
  const alongTrack = Math.acos(Math.min(1, Math.max(-1, Math.cos(d13) / Math.cos(crossTrack))));
  const ahead = Math.cos(theta13 - theta12) >= 0 ? 1 : -1;
  // The desired track at the abeam point: the bearing from there to the TO waypoint
  const legLength = sndDistance(from, to);
  // A leg of no length (DIR TO over the waypoint): the abeam point is the FROM point
  const fraction = legLength > 1e-6 ? (ahead * alongTrack * EARTH_RADIUS) / legLength : 0;
  const abeam = sndIntermediate(from, to, Math.min(1, Math.max(0, fraction)));
  const desiredTrack =
    legLength - ahead * alongTrack * EARTH_RADIUS > 0.1 ? sndBearing(abeam, to) : sndBearing(from, to);
  return { crossTrack: crossTrack * EARTH_RADIUS, alongTrack: ahead * alongTrack * EARTH_RADIUS, desiredTrack };
}

/** The point at a fraction of the great circle from a to b */
export function sndIntermediate(a: SndPoint, b: SndPoint, fraction: number): SndPoint {
  const d = sndDistance(a, b) / EARTH_RADIUS;
  if (d < 1e-9) {
    return a;
  }
  const A = Math.sin((1 - fraction) * d) / Math.sin(d);
  const B = Math.sin(fraction * d) / Math.sin(d);
  const x = A * Math.cos(rad(a.lat)) * Math.cos(rad(a.lon)) + B * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon));
  const y = A * Math.cos(rad(a.lat)) * Math.sin(rad(a.lon)) + B * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon));
  const z = A * Math.sin(rad(a.lat)) + B * Math.sin(rad(b.lat));
  return { lat: deg(Math.atan2(z, Math.hypot(x, y))), lon: deg(Math.atan2(y, x)) };
}

/**
 * A waypoint of the list, truncated to the minutes as the FCOM says (DSC-34-10-20-30): e.g. N4815/E00536
 */
export function formatWaypoint(p: SndPoint): string {
  const part = (value: number, positive: string, negative: string, degreeDigits: number) => {
    const minutes = Math.floor(Math.abs(value) * 60 + 1e-9);
    const d = Math.floor(minutes / 60);
    return `${value >= 0 ? positive : negative}${d.toString().padStart(degreeDigits, '0')}${(minutes - d * 60)
      .toString()
      .padStart(2, '0')}`;
  };
  return `${part(p.lat, 'N', 'S', 2)}/${part(p.lon, 'E', 'W', 3)}`;
}
