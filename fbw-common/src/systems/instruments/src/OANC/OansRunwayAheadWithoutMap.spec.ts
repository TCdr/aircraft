// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { AwarenessRunway } from '@flybywiresim/fbw-sdk';
import { OansRunwayAheadWithoutMap } from './OansRunwayAheadWithoutMap';

const EARTH_RADIUS_M = 6_371_000;

/** Runway 09L/27R, 3000 m by 45 m */
const RUNWAY: AwarenessRunway = {
  airport: 'TEST',
  latitude: 45,
  longitude: 5,
  length: 3_000,
  width: 45,
  ends: [
    { number: 9, designator: 'L', ident: '09L', course: 90, displacedThreshold: 0, elevation: 100 },
    { number: 27, designator: 'R', ident: '27R', course: 270, displacedThreshold: 0, elevation: 100 },
  ],
};

/** The latitude and longitude of a point east and north of the runway centre, in metres */
function position(east: number, north: number): [number, number] {
  return [
    RUNWAY.latitude + (north / EARTH_RADIUS_M) * (180 / Math.PI),
    RUNWAY.longitude + (east / (EARTH_RADIUS_M * Math.cos((RUNWAY.latitude * Math.PI) / 180))) * (180 / Math.PI),
  ];
}

/** The A380 volume at 15 kt: from the nose (36.5 m) to 7 s ahead, 60 m wide */
function ahead(east: number, north: number, heading: number): string[] {
  const horizon = 15 * (1_852 / 3_600) * 7 + 36.5;
  return OansRunwayAheadWithoutMap.runwaysAhead([RUNWAY], ...position(east, north), heading, 36.5, horizon, 30);
}

describe('OansRunwayAheadWithoutMap', () => {
  it('finds the runway ahead of a taxiing aircraft', () => {
    // Heading north towards the runway, the nose 40 m from its edge: the volume reaches 54 m past the nose
    expect(ahead(0, -(22.5 + 36.5 + 40), 0)).toEqual(['09L - 27R']);
  });

  it('ignores a runway out of reach, behind, or beside the aircraft', () => {
    expect(ahead(0, -(22.5 + 36.5 + 120), 0)).toEqual([]);
    expect(ahead(0, -(22.5 + 36.5 + 70), 180)).toEqual([]);
    // Taxiing parallel to the runway, 100 m south of its centreline
    expect(ahead(0, -100, 90)).toEqual([]);
  });

  it('finds a runway entered at an angle', () => {
    // North-east, towards the western end of the runway
    expect(ahead(-1_480, -80, 45)).toEqual(['09L - 27R']);
  });

  it('ignores the runway the aircraft is on', () => {
    expect(ahead(0, 0, 0)).toEqual([]);
  });
});
