// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** One direction of a runway, as a runway awareness function names and uses it */
export interface AwarenessRunwayEnd {
  /** The runway number, 1 to 36 */
  readonly number: number;
  /** The runway designator: '', 'L', 'C' or 'R' */
  readonly designator: '' | 'L' | 'C' | 'R';
  /** The ident, e.g. '04' or '25R' */
  readonly ident: string;
  /** The true course of this direction, in degrees */
  readonly course: number;
  /** The distance from this end of the paved runway to its landing threshold, in metres */
  readonly displacedThreshold: number;
  /** The elevation of the landing threshold, in metres */
  readonly elevation: number;
}

/** A runway: a rectangle of paved surface, with its two ends */
export interface AwarenessRunway {
  /** The airport ident, e.g. 'KSFO' */
  readonly airport: string;
  /** The latitude of the runway centre, in degrees */
  readonly latitude: number;
  /** The longitude of the runway centre, in degrees */
  readonly longitude: number;
  /** The total length, displaced thresholds included, in metres */
  readonly length: number;
  /** The width, in metres */
  readonly width: number;
  /** The primary end ([0], its course is the runway direction) and the secondary end ([1]) */
  readonly ends: readonly [AwarenessRunwayEnd, AwarenessRunwayEnd];
}

/** A point in the frame of a runway */
export interface RunwayFramePosition {
  /** The distance along the runway from its centre, towards the primary course, in metres */
  along: number;
  /** The distance across the runway from its centreline, positive to the right of the primary course, in metres */
  cross: number;
}

const EARTH_RADIUS_M = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;

/** Flat-earth runway geometry: exact enough within the few nautical miles around an airport */
export class AwarenessRunwayGeometry {
  /** A unique key of a runway */
  public static key(runway: AwarenessRunway): string {
    return `${runway.airport}${runway.ends[0].ident}${runway.ends[1].ident}`;
  }

  /**
   * The position of a point in the frame of a runway.
   * @param runway the runway
   * @param latitude the latitude of the point, in degrees
   * @param longitude the longitude of the point, in degrees
   * @param forwardOffset a distance to move the point forward first (e.g. the flight deck ahead of the aircraft reference), in metres
   * @param heading the true heading the forward offset is along, in degrees
   * @param out the object to write the result to
   */
  public static toRunwayFrame(
    runway: AwarenessRunway,
    latitude: number,
    longitude: number,
    forwardOffset = 0,
    heading = 0,
    out: RunwayFramePosition = { along: 0, cross: 0 },
  ): RunwayFramePosition {
    const east =
      (longitude - runway.longitude) * DEG_TO_RAD * EARTH_RADIUS_M * Math.cos(runway.latitude * DEG_TO_RAD) +
      forwardOffset * Math.sin(heading * DEG_TO_RAD);
    const north =
      (latitude - runway.latitude) * DEG_TO_RAD * EARTH_RADIUS_M + forwardOffset * Math.cos(heading * DEG_TO_RAD);
    const course = runway.ends[0].course * DEG_TO_RAD;
    out.along = east * Math.sin(course) + north * Math.cos(course);
    out.cross = east * Math.cos(course) - north * Math.sin(course);
    return out;
  }

  /** Whether a point is on the paved runway rectangle */
  public static isOnRunway(runway: AwarenessRunway, pos: RunwayFramePosition): boolean {
    return Math.abs(pos.along) <= runway.length / 2 && Math.abs(pos.cross) <= runway.width / 2;
  }

  /**
   * The distance along a runway direction, from the start of the paved runway in that direction.
   * @param runway the runway
   * @param endIndex 0 for the primary direction, 1 for the secondary direction
   * @param pos the point
   */
  public static distanceFromStart(runway: AwarenessRunway, endIndex: 0 | 1, pos: RunwayFramePosition): number {
    return endIndex === 0 ? pos.along + runway.length / 2 : runway.length / 2 - pos.along;
  }

  /** The distance from a point to the far end of the paved runway, in a runway direction, in metres */
  public static distanceToEnd(runway: AwarenessRunway, endIndex: 0 | 1, pos: RunwayFramePosition): number {
    return runway.length - AwarenessRunwayGeometry.distanceFromStart(runway, endIndex, pos);
  }

  /** The runway direction a true heading or track is aligned with, within a tolerance, or null */
  public static alignedEnd(runway: AwarenessRunway, trueDirection: number, tolerance: number): 0 | 1 | null {
    if (AwarenessRunwayGeometry.angleBetween(trueDirection, runway.ends[0].course) <= tolerance) {
      return 0;
    }
    if (AwarenessRunwayGeometry.angleBetween(trueDirection, runway.ends[1].course) <= tolerance) {
      return 1;
    }
    return null;
  }

  /** The end of the runway nearest to a point on or beside it */
  public static nearestEnd(pos: RunwayFramePosition): 0 | 1 {
    return pos.along <= 0 ? 0 : 1;
  }

  /**
   * The distance a point moving on a true direction covers before it enters the runway rectangle, or null when it
   * does not reach it. 0 when the point is already on it.
   */
  public static distanceToEnter(
    runway: AwarenessRunway,
    pos: RunwayFramePosition,
    trueDirection: number,
  ): number | null {
    const relative = (trueDirection - runway.ends[0].course) * DEG_TO_RAD;
    const dAlong = Math.cos(relative);
    const dCross = Math.sin(relative);
    let tMin = 0;
    let tMax = Infinity;
    for (const [p, d, half] of [
      [pos.along, dAlong, runway.length / 2],
      [pos.cross, dCross, runway.width / 2],
    ]) {
      if (Math.abs(d) < 1e-9) {
        if (Math.abs(p) > half) {
          return null;
        }
      } else {
        const t1 = (-half - p) / d;
        const t2 = (half - p) / d;
        tMin = Math.max(tMin, Math.min(t1, t2));
        tMax = Math.min(tMax, Math.max(t1, t2));
      }
    }
    return tMin <= tMax ? tMin : null;
  }

  /** The distance from a point to the runway rectangle, 0 when on it, in metres */
  public static distanceToRunway(runway: AwarenessRunway, pos: RunwayFramePosition): number {
    const dAlong = Math.max(0, Math.abs(pos.along) - runway.length / 2);
    const dCross = Math.max(0, Math.abs(pos.cross) - runway.width / 2);
    return Math.hypot(dAlong, dCross);
  }

  /** The smallest angle between two directions, in degrees, 0 to 180 */
  public static angleBetween(a: number, b: number): number {
    const diff = Math.abs((((a - b) % 360) + 360) % 360);
    return diff > 180 ? 360 - diff : diff;
  }
}
