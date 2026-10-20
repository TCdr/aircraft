// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { placeBearingDistance } from 'msfs-geo';
import { SafetyAltitudeSource } from './SafetyAltitudeGrid';
import {
  computeVdSafetyAltitudes,
  positionOnCut,
  vdCutAlongFlightPlan,
  vdCutAlongTrack,
  vdCutHalfWidthNm,
} from './VdSafetyAltitudeProfile';

/** Grid MORA 2000 ft west of 6E, 17300 ft east of it; no data north of 83N; MSA 4000 ft everywhere */
const source: SafetyAltitudeSource = {
  gridMoraFeet: (lat, long, halfWidthNm) => {
    if (lat + halfWidthNm / 60 >= 83) {
      return null;
    }
    const halfLong = halfWidthNm / (60 * Math.cos((lat * Math.PI) / 180));
    return long + halfLong >= 6 ? 17300 : 2000;
  },
  msaFeet: () => 4000,
};

const start = { lat: 45.5, long: 5 };

describe('VD safety altitudes along the cut', () => {
  it('along the track: the grid MORA of the cells crossed, in segments over 160 NM', () => {
    const segments = computeVdSafetyAltitudes(source, vdCutAlongTrack(start, 90), [], 0);
    expect(segments.length).toBe(2);
    expect(segments[0]).toMatchObject({ startNm: 0, altitudeFt: 2000, type: 'MORA' });
    // 1° of longitude at 45.5N is 42 NM
    expect(segments[0].endNm).toBe(42);
    expect(segments[1]).toMatchObject({ startNm: 42, endNm: 160, altitudeFt: 17300, type: 'MORA' });
  });

  it('a wider cut reaches the next cell earlier', () => {
    const segments = computeVdSafetyAltitudes(source, vdCutAlongTrack(start, 90), [], 2);
    expect(segments[0].endNm).toBe(40);
  });

  it('the MSA within 25 NM of an airport with a selected procedure, the grid MORA beyond', () => {
    const segments = computeVdSafetyAltitudes(source, vdCutAlongTrack(start, 90), [{ ...start, altitudeFt: 4000 }], 0);
    expect(segments[0]).toMatchObject({ startNm: 0, endNm: 25, altitudeFt: 4000, type: 'MSA' });
    expect(segments[1]).toMatchObject({ startNm: 25, endNm: 42, altitudeFt: 2000, type: 'MORA' });
  });

  it('no value where the database has none', () => {
    const segments = computeVdSafetyAltitudes(source, vdCutAlongTrack({ lat: 82, long: 0 }, 0), [], 0);
    expect(segments[0]).toMatchObject({ startNm: 0, endNm: 60, altitudeFt: 2000 });
    expect(segments[1]).toMatchObject({ startNm: 60, endNm: 160, altitudeFt: null });
  });

  it('no safety altitude across a flight plan discontinuity', () => {
    const fix1 = placeBearingDistance(start, 270, 30);
    const fix2 = placeBearingDistance(fix1, 270, 50);
    const cut = vdCutAlongFlightPlan(start, [
      { isDiscontinuity: false, location: fix1, distanceFromAircraftNm: 30 },
      { isDiscontinuity: true },
      { isDiscontinuity: false, location: fix2, distanceFromAircraftNm: 80 },
    ]);
    expect(cut.discontinuities).toEqual([{ startNm: 30, endNm: 80 }]);
    const segments = computeVdSafetyAltitudes(source, cut, [], 0);
    expect(segments.map((s) => [s.startNm, s.endNm])).toEqual([
      [0, 30],
      [80, 160],
    ]);
  });
});

describe('VD cut along the flight plan', () => {
  it('goes through the fixes at their predicted distance, straight across legs without a fix', () => {
    const fix1 = placeBearingDistance(start, 0, 20);
    const fix2 = placeBearingDistance(fix1, 90, 40);
    const cut = vdCutAlongFlightPlan(start, [
      { isDiscontinuity: false, location: null, distanceFromAircraftNm: 5 },
      { isDiscontinuity: false, location: fix1, distanceFromAircraftNm: 22 },
      { isDiscontinuity: false, location: fix2, distanceFromAircraftNm: 62 },
    ]);
    expect(cut.points.map((p) => p.distanceNm)).toEqual([0, 22, 62]);
    // 22 NM of flight plan over a 20 NM straight line: half way is 10 NM out
    const halfWay = positionOnCut(cut, 11);
    expect(halfWay.lat).toBeCloseTo(placeBearingDistance(start, 0, 10).lat, 4);
    // Beyond the last fix the cut goes on straight
    const beyond = positionOnCut(cut, 72);
    expect(beyond.long).toBeCloseTo(placeBearingDistance(fix2, 90, 10).long, 2);
  });

  it('stops after the first fix beyond the VD range', () => {
    const far = placeBearingDistance(start, 0, 170);
    const farther = placeBearingDistance(start, 0, 300);
    const cut = vdCutAlongFlightPlan(start, [
      { isDiscontinuity: false, location: far, distanceFromAircraftNm: 170 },
      { isDiscontinuity: false, location: farther, distanceFromAircraftNm: 300 },
    ]);
    expect(cut.points.length).toBe(2);
  });
});

describe('VD cut width', () => {
  it('twice the maximum of the EPU and the FMS RNP, at most 10 NM', () => {
    expect(vdCutHalfWidthNm(0.1, 2)).toBe(2);
    expect(vdCutHalfWidthNm(3, 1)).toBe(3);
    expect(vdCutHalfWidthNm(Infinity, 1)).toBe(1);
    expect(vdCutHalfWidthNm(8, 2)).toBe(5);
  });
});
