// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { AwarenessRunway } from '@flybywiresim/fbw-sdk';
import { closestVdAirports, smallestEnclosingCircle, VD_AIRPORT_MARGIN_NM, vdAirports } from './VdAirports';

const end = (course: number, elevation: number) => ({
  number: 1,
  designator: '' as const,
  ident: '01',
  course,
  displacedThreshold: 0,
  elevation,
});

const runway = (
  airport: string,
  latitude: number,
  longitude: number,
  course: number,
  lengthM: number,
  widthM: number,
  elevationsM: [number, number],
): AwarenessRunway => ({
  airport,
  latitude,
  longitude,
  length: lengthM,
  width: widthM,
  ends: [end(course, elevationsM[0]), end((course + 180) % 360, elevationsM[1])],
});

/** The distance between two positions, in nautical miles (flat earth) */
const distanceNm = (latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) =>
  Math.hypot((longitudeA - longitudeB) * 60 * Math.cos((latitudeA * Math.PI) / 180), (latitudeA - latitudeB) * 60);

describe('smallestEnclosingCircle', () => {
  it('is the circle on the diameter for two points and the circumcircle for an acute triangle', () => {
    const two = smallestEnclosingCircle([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ]);
    expect(two.x).toBeCloseTo(2, 9);
    expect(two.y).toBeCloseTo(0, 9);
    expect(two.r).toBeCloseTo(2, 9);
    // an equilateral triangle of side 2: radius 2 / sqrt(3)
    const triangle = smallestEnclosingCircle([
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: Math.sqrt(3) },
    ]);
    expect(triangle.r).toBeCloseTo(2 / Math.sqrt(3), 9);
  });

  it('holds every point, whatever their order, and is no larger than needed', () => {
    const points = [
      { x: 0.3, y: 0.1 },
      { x: -2, y: 1 },
      { x: 1.5, y: -1.8 },
      { x: 0, y: 0 },
      { x: 2.2, y: 2 },
      { x: -1, y: -2.5 },
      { x: 0.5, y: 0.4 },
    ];
    for (const order of [points, [...points].reverse()]) {
      const circle = smallestEnclosingCircle(order);
      for (const p of points) {
        expect(Math.hypot(p.x - circle.x, p.y - circle.y)).toBeLessThanOrEqual(circle.r + 1e-9);
      }
      // the two farthest points apart set a lower bound: half their distance
      expect(circle.r).toBeGreaterThanOrEqual(Math.hypot(2.2 + 1, 2 + 2.5) / 2 - 1e-9);
      expect(circle.r).toBeLessThan(3.2);
    }
  });

  it('copes with collinear points', () => {
    const circle = smallestEnclosingCircle([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 3, y: 0 },
    ]);
    expect(circle.x).toBeCloseTo(1.5, 9);
    expect(circle.r).toBeCloseTo(1.5, 9);
  });
});

describe('vdAirports', () => {
  it('gives a one-runway airport the circle of its runway, margin included, at its higher threshold', () => {
    // 3704 m = 2 NM long, 60 m wide: half its diagonal is about 1 NM
    const [airport] = vdAirports([runway('CYUL', 45.47, -73.74, 57, 3704, 60, [30, 36])]);
    expect(distanceNm(airport.latitude, airport.longitude, 45.47, -73.74)).toBeLessThan(1e-6);
    expect(airport.radiusNm).toBeCloseTo(Math.hypot(1, 30 / 1852) + VD_AIRPORT_MARGIN_NM, 6);
    expect(airport.elevationFt).toBeCloseTo(36 * 3.28084, 6);
  });

  it('gives one circle per airport, holding all its runways and the taxiways between them', () => {
    // Two parallel north-south runways 1 NM apart, each 2 NM long, at the same airport; another airport further away
    const airports = vdAirports([
      runway('KAAA', 40, -100, 0, 3704, 45, [100, 110]),
      runway('KBBB', 41, -100, 90, 2000, 45, [500, 500]),
      runway('KAAA', 40, -100 + 1 / (60 * Math.cos((40 * Math.PI) / 180)), 0, 3704, 45, [120, 115]),
    ]);
    expect(airports).toHaveLength(2);
    const aaa = airports[0];
    // centred between the runways, half a nautical mile east of the first one
    expect(
      distanceNm(aaa.latitude, aaa.longitude, 40, -100 + 0.5 / (60 * Math.cos((40 * Math.PI) / 180))),
    ).toBeLessThan(1e-3);
    // the corners are 0.5 NM + half the width across and 1 NM along from the centre
    expect(aaa.radiusNm).toBeCloseTo(Math.hypot(0.5 + 22.5 / 1852, 1) + VD_AIRPORT_MARGIN_NM, 3);
    expect(aaa.elevationFt).toBeCloseTo(120 * 3.28084, 6);
    // a taxiway 0.25 NM beside the outer runway, which the 0.15 NM rectangle margin of each runway left as a spike, is
    // inside the circle
    const taxiwayLongitude = -100 + (1 + 0.25) / (60 * Math.cos((40 * Math.PI) / 180));
    expect(distanceNm(aaa.latitude, aaa.longitude, 40, taxiwayLongitude)).toBeLessThan(aaa.radiusNm);
    expect(airports[1].elevationFt).toBeCloseTo(500 * 3.28084, 6);
  });

  it('keeps nothing for no runway', () => {
    expect(vdAirports([])).toEqual([]);
  });
});

describe('closestVdAirports', () => {
  it('keeps the closest airports, by the distance to the edge of their circle', () => {
    const a = (latitude: number, radiusNm: number) => ({ latitude, longitude: -73.7, radiusNm, elevationFt: 0 });
    const near = a(45.1, 1); // 6 NM away, edge 5 NM
    const large = a(45.2, 9); // 12 NM away, edge 3 NM
    const far = a(46, 1);
    expect(closestVdAirports([far, near, large], 45, -73.7, 2)).toEqual([large, near]);
    expect(closestVdAirports([far, near], 45, -73.7, 5)).toEqual([near, far]);
  });
});
