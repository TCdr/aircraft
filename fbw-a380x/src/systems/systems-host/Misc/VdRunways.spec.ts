// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { AwarenessRunway } from '@flybywiresim/fbw-sdk';
import { closestVdRunways, VD_RUNWAY_MARGIN_NM, vdRunways } from './VdRunways';

const end = (course: number, elevation: number) => ({
  number: 1,
  designator: '' as const,
  ident: '01',
  course,
  displacedThreshold: 0,
  elevation,
});

const runway = (
  latitude: number,
  longitude: number,
  course: number,
  lengthM: number,
  widthM: number,
  elevationsM: [number, number],
): AwarenessRunway => ({
  airport: 'CYUL',
  latitude,
  longitude,
  length: lengthM,
  width: widthM,
  ends: [end(course, elevationsM[0]), end((course + 180) % 360, elevationsM[1])],
});

describe('vdRunways', () => {
  it('gives each runway its rectangle, margin included, and its higher threshold', () => {
    const [r] = vdRunways([runway(45.47, -73.74, 57, 3704, 60, [30, 36])]);
    expect(r.latitude).toBe(45.47);
    expect(r.longitude).toBe(-73.74);
    expect(r.course).toBe(57);
    // 3704 m = 2 NM long, 60 m wide
    expect(r.halfLengthNm).toBeCloseTo(1 + VD_RUNWAY_MARGIN_NM, 9);
    expect(r.halfWidthNm).toBeCloseTo(30 / 1852 + VD_RUNWAY_MARGIN_NM, 9);
    expect(r.elevationFt).toBeCloseTo(36 * 3.28084, 6);
  });

  it('keeps one rectangle per runway', () => {
    expect(vdRunways([runway(45, -73, 0, 2000, 45, [0, 0]), runway(45.01, -73, 90, 2000, 45, [0, 0])])).toHaveLength(2);
    expect(vdRunways([])).toEqual([]);
  });
});

describe('closestVdRunways', () => {
  it('keeps the closest runways, by the distance to their nearer end', () => {
    const r = (latitude: number, halfLengthNm: number) => ({
      latitude,
      longitude: -73.7,
      course: 0,
      halfLengthNm,
      halfWidthNm: 0.2,
      elevationFt: 0,
    });
    const near = r(45.1, 1); // 6 NM away, nearer end 5 NM
    const long = r(45.2, 9); // 12 NM away, nearer end 3 NM
    const far = r(46, 1);
    expect(closestVdRunways([far, near, long], 45, -73.7, 2)).toEqual([long, near]);
    expect(closestVdRunways([far, near], 45, -73.7, 5)).toEqual([near, far]);
  });
});
