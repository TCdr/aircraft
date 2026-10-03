// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AwarenessRunway } from '@flybywiresim/fbw-sdk';

/**
 * A runway the A380X VD draws as flat ground (L:A380X_VD_RUNWAY_*, read by the native VD terrain gauge ndwxr,
 * vd_runways.h): the terrain MapView draws the airport diagram over the terrain, which the VD would read as terrain
 * far above its plot, so the gauge replaces the stretches of its cut whose band reaches one of these rectangles with
 * flat ground at the runway's elevation (a design choice: a runway is flat ground). Rectangles rather than a circle
 * around the airport keep the terrain around the runways on the profile.
 */
export interface VdRunway {
  /** The runway centre, in degrees */
  readonly latitude: number;
  readonly longitude: number;
  /** The true course of its primary direction, in degrees */
  readonly course: number;
  /** Half its length and half its width, margin included, in nautical miles */
  readonly halfLengthNm: number;
  readonly halfWidthNm: number;
  /** Its higher threshold, in feet */
  readonly elevationFt: number;
}

/**
 * Around each runway the sim's diagram also draws its edges and the start of the taxiways (design choice, from the
 * CYUL diagram seen in the sim): the rectangle is grown by this much on every side.
 */
export const VD_RUNWAY_MARGIN_NM = 0.15;

const METRES_PER_NM = 1852;
const FEET_PER_METRE = 3.28084;
const DEG_TO_RAD = Math.PI / 180;

/**
 * The VD rectangles of a list of runways.
 * @param runways the runways around the aircraft (NearbyRunwayProvider)
 */
export function vdRunways(runways: readonly AwarenessRunway[]): VdRunway[] {
  return runways.map((runway) => ({
    latitude: runway.latitude,
    longitude: runway.longitude,
    course: runway.ends[0].course,
    halfLengthNm: runway.length / 2 / METRES_PER_NM + VD_RUNWAY_MARGIN_NM,
    halfWidthNm: runway.width / 2 / METRES_PER_NM + VD_RUNWAY_MARGIN_NM,
    elevationFt: Math.max(runway.ends[0].elevation, runway.ends[1].elevation) * FEET_PER_METRE,
  }));
}

/**
 * The runways to publish: the closest ones first (by the distance to their nearer end), at most maxCount.
 * @param runways the VD rectangles of the runways around the aircraft
 * @param latitude the aircraft latitude, in degrees
 * @param longitude the aircraft longitude, in degrees
 * @param maxCount the most runways published
 */
export function closestVdRunways(
  runways: readonly VdRunway[],
  latitude: number,
  longitude: number,
  maxCount: number,
): VdRunway[] {
  const nmPerDegreeLon = 60 * Math.cos(latitude * DEG_TO_RAD);
  const distance = (r: VdRunway) =>
    Math.hypot((r.longitude - longitude) * nmPerDegreeLon, (r.latitude - latitude) * 60) - r.halfLengthNm;
  return [...runways].sort((a, b) => distance(a) - distance(b)).slice(0, maxCount);
}
