// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { TaxiLineKind, TaxiPoint } from '@flybywiresim/fbw-sdk';
import { TaxiAirport } from '../Taxi/TaxiAirport';
import { boxOf, indexAirport, inView, pictureChanged, PushbackMapPicture, viewBox } from './pushbackAirportDraw';

const square = (x: number, y: number, side: number): TaxiPoint[] => [
  [x, y],
  [x + side, y],
  [x + side, y + side],
  [x, y + side],
];

/** An airport with an apron at the stands (near the origin) and a taxiway and runway 3 km away */
const airport = {
  icao: 'XTST',
  arp: { lat: 0, long: 0 },
  shapes: {
    aprons: [square(-100, -100, 200)],
    taxiways: [square(3000, 0, 50)],
    runways: [square(0, 3000, 60)],
  },
  network: {
    lines: [
      {
        kind: TaxiLineKind.Stand,
        name: null,
        points: [
          [0, 0],
          [0, 50],
        ] as TaxiPoint[],
      },
      {
        kind: TaxiLineKind.Taxiway,
        name: 'A',
        points: [
          [3000, 0],
          [3000, 2000],
        ] as TaxiPoint[],
      },
      {
        kind: TaxiLineKind.Runway,
        name: null,
        points: [
          [0, 3000],
          [3000, 3000],
        ] as TaxiPoint[],
      },
    ],
    nodes: [],
    edges: [],
    adjacency: [],
  },
  stands: [],
  runways: [],
} as unknown as TaxiAirport;

describe('the pushback map airport drawing', () => {
  it('gives each shape and line its bounding box, and keeps the runway lines out', () => {
    expect(boxOf(square(10, 20, 5))).toEqual({ minX: 10, minY: 20, maxX: 15, maxY: 25 });
    const index = indexAirport(airport);
    expect(index.aprons).toHaveLength(1);
    expect(index.standLines).toHaveLength(1);
    expect(index.guidanceLines).toHaveLength(1);
    expect(index.guidanceLines[0].box).toEqual({ minX: 3000, minY: 0, maxX: 3000, maxY: 2000 });
  });

  it('draws only what reaches the window: at pushback zoom, the apron and not the far taxiway and runway', () => {
    const index = indexAirport(airport);
    // a 600 x 400 px window at 2 px/m around the stand: about 180 m each way
    const view = viewBox(0, 0, 600, 400, 2);
    expect(inView(index.aprons, view)).toHaveLength(1);
    expect(inView(index.standLines, view)).toHaveLength(1);
    expect(inView(index.taxiways, view)).toHaveLength(0);
    expect(inView(index.runways, view)).toHaveLength(0);
    expect(inView(index.guidanceLines, view)).toHaveLength(0);
    // zoomed out to 0.1 px/m (about 3.6 km each way): everything
    const wide = viewBox(0, 0, 600, 400, 0.1);
    expect(inView(index.taxiways, wide)).toHaveLength(1);
    expect(inView(index.runways, wide)).toHaveLength(1);
  });

  it('covers the window whatever the map rotation (half the diagonal each way)', () => {
    const view = viewBox(0, 0, 600, 800, 1);
    // half the diagonal is 500 px = 500 m, plus the margin
    expect(view.maxX).toBeGreaterThanOrEqual(500);
    expect(view.minY).toBeLessThanOrEqual(-500);
  });

  it('draws the picture again only when it moves by about a pixel', () => {
    const picture: PushbackMapPicture = {
      airport: 'XTST',
      cx: 0,
      cy: 0,
      headingTrue: 90,
      pxPerMetre: 2,
      width: 600,
      height: 400,
    };
    expect(pictureChanged(null, picture)).toBe(true);
    // the pushback moves 0.1 m between two position reads (2 kt, 50 ms): 0.2 px, not drawn again
    expect(pictureChanged(picture, { ...picture, cx: 0.1 })).toBe(false);
    // 0.6 m: 1.2 px
    expect(pictureChanged(picture, { ...picture, cx: 0.6 })).toBe(true);
    // a turn of 0.05 degrees moves the corners by 0.3 px; 0.2 degrees by 1.3 px
    expect(pictureChanged(picture, { ...picture, headingTrue: 90.05 })).toBe(false);
    expect(pictureChanged(picture, { ...picture, headingTrue: 90.2 })).toBe(true);
    // through north
    expect(pictureChanged({ ...picture, headingTrue: 359.99 }, { ...picture, headingTrue: 0.01 })).toBe(false);
    // another scale, size or airport
    expect(pictureChanged(picture, { ...picture, pxPerMetre: 1 })).toBe(true);
    expect(pictureChanged(picture, { ...picture, width: 601 })).toBe(true);
    expect(pictureChanged(picture, { ...picture, airport: null })).toBe(true);
  });
});
