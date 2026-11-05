// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { bbox, bboxPolygon, booleanPointInPolygon, featureCollection, lineString, point } from '@turf/turf';
import { Position } from 'geojson';
import { describe, expect, it } from 'vitest';
import { OancAirportBounds } from './OancAirportBounds';

/** A small map spanning x -100..300 and y -50..200 */
function smallMap() {
  return featureCollection([
    point([-100, 0]),
    point([300, 200]),
    lineString([
      [0, -50],
      [120, 80],
    ]),
  ]);
}

const PROBES: Position[] = [
  [0, 0],
  [250, 150],
  [-100.5, 0],
  [300.5, 100],
  [100, -50.5],
  [100, 200.5],
  [-500, -500],
  [400, 300],
  [-100, 200],
];

describe('OancAirportBounds', () => {
  it('contains nothing before a map is set', () => {
    expect(new OancAirportBounds().contains([0, 0])).toBe(false);
  });

  it('answers like the bounding box polygon of the map', () => {
    const map = smallMap();
    const bounds = new OancAirportBounds();
    bounds.set(map);

    for (const probe of PROBES) {
      expect(bounds.contains(probe)).toBe(booleanPointInPolygon(probe, bboxPolygon(bbox(map))));
    }
    expect(bounds.contains([0, 0])).toBe(true);
    expect(bounds.contains([-500, -500])).toBe(false);
  });

  it('returns the bounding box of the map for the canvas size', () => {
    const bounds = new OancAirportBounds();
    expect(bounds.set(smallMap())).toEqual([-100, -50, 300, 200]);
  });

  it('contains nothing after it is cleared', () => {
    const bounds = new OancAirportBounds();
    bounds.set(smallMap());
    bounds.clear();

    expect(bounds.contains([0, 0])).toBe(false);
  });

  it('replaces the extent of the first map with the extent of the second', () => {
    const bounds = new OancAirportBounds();
    bounds.set(smallMap());
    bounds.set(featureCollection([point([1000, 1000]), point([2000, 2000])]));

    expect(bounds.contains([0, 0])).toBe(false);
    expect(bounds.contains([1500, 1500])).toBe(true);
  });

  it('does not read the map again for each check', () => {
    const map = smallMap();
    let featureReads = 0;
    const features = map.features;
    Object.defineProperty(map, 'features', {
      get: () => {
        featureReads++;
        return features;
      },
    });

    const bounds = new OancAirportBounds();
    bounds.set(map);
    const readsAtLoad = featureReads;

    for (let i = 0; i < 1000; i++) {
      bounds.contains(PROBES[i % PROBES.length]);
    }

    expect(readsAtLoad).toBeGreaterThan(0);
    expect(featureReads).toBe(readsAtLoad);
  });
});
