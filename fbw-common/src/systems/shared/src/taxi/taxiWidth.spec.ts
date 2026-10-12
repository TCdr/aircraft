// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FeatureType } from '../amdb';
import { taxiLinesFromAmdb, taxiPavementFromAmdb } from './taxiAmdb';
import { taxiDefaultEntry } from './taxiDeparture';
import { buildTaxiNetwork, TaxiLine, TaxiLineKind, TaxiPoint } from './taxiNetwork';
import { taxiRoute, TaxiRouteError } from './taxiRoute';
import {
  TAXI_A380,
  TaxiLineFit,
  taxiLineFits,
  taxiLineWidth,
  taxiPavement,
  taxiPavementWidth,
  taxiTooNarrowLines,
} from './taxiWidth';

const line = (kind: TaxiLineKind, name: string | null, ...points: TaxiPoint[]): TaxiLine => ({ kind, name, points });
const rectangle = (x0: number, y0: number, x1: number, y1: number): TaxiPoint[][] => [
  [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ],
];

/**
 * Taxiway N (y = 0): 23 m wide (code E), in two adjacent elements that share the edge x = 100, a wide junction at its
 * east end; taxiway F (y = 100): 25 m wide (code F); P on an apron of 200 m with a grass island (a hole) 10 m north of
 * the line; U off the pavement of the map.
 */
const PAVEMENT = taxiPavement([
  rectangle(0, -11.5, 100, 11.5),
  rectangle(100, -11.5, 190, 11.5),
  rectangle(190, -30, 230, 30),
  rectangle(0, 87.5, 200, 112.5),
  [...rectangle(0, 300, 200, 500), [...rectangle(50, 410, 150, 450)[0]].reverse()],
]);

describe('Taxiway width for the A380', () => {
  it('measures the pavement across a line, adjacent elements joined, holes left out', () => {
    expect(taxiPavementWidth(PAVEMENT, [50, 0], [1, 0])).toBeCloseTo(23, 6);
    // On the edge shared by the two elements of N
    expect(taxiPavementWidth(PAVEMENT, [100, 0], [1, 0])).toBeCloseTo(23, 6);
    // Off centre, the width is the same
    expect(taxiPavementWidth(PAVEMENT, [150, 3], [1, 0])).toBeCloseTo(23, 6);
    expect(taxiPavementWidth(PAVEMENT, [100, 100], [-1, 0])).toBeCloseTo(25, 6);
    // On the apron: from the south edge (100 m away: the probe stops at 60 m) to the grass island (10 m)
    expect(taxiPavementWidth(PAVEMENT, [100, 400], [1, 0])).toBeCloseTo(70, 6);
    expect(taxiPavementWidth(PAVEMENT, [100, 1000], [1, 0])).toBeNull();
  });

  it('takes the narrowest width along a line, away from the junction at its end', () => {
    expect(
      taxiLineWidth(PAVEMENT, [
        [0, 0],
        [210, 0],
      ]),
    ).toBeCloseTo(23, 6);
    // A short piece inside the junction
    expect(
      taxiLineWidth(PAVEMENT, [
        [200, 0],
        [220, 0],
      ]),
    ).toBeCloseTo(60, 6);
  });

  it('rates each line: wingspan limit of the airport map first, then the pavement width, else unverified', () => {
    const lines = [
      line(TaxiLineKind.Taxiway, 'N', [0, 0], [210, 0]),
      line(TaxiLineKind.Taxiway, 'F', [0, 100], [200, 100]),
      line(TaxiLineKind.Taxiway, 'P', [0, 400], [200, 400]),
      line(TaxiLineKind.Taxiway, 'U', [0, 1000], [200, 1000]),
      // The airport map limits the wide F to 65 m (code E), clears the narrow N for 80 m
      { ...line(TaxiLineKind.Taxiway, 'F', [0, 100], [200, 100]), wingspan: 65 },
      { ...line(TaxiLineKind.Taxiway, 'N', [0, 0], [210, 0]), wingspan: 80 },
      line(TaxiLineKind.Runway, '09.27', [0, 1000], [200, 1000]),
    ];
    const fits = taxiLineFits(lines, PAVEMENT, TAXI_A380);
    expect(fits.map((f) => f.fit)).toEqual([
      TaxiLineFit.TooNarrow,
      TaxiLineFit.Suitable,
      TaxiLineFit.Suitable,
      TaxiLineFit.Unverified,
      TaxiLineFit.TooNarrow,
      TaxiLineFit.Suitable,
      TaxiLineFit.Suitable,
    ]);
    expect(fits[0].width).toBeCloseTo(23, 6);
    expect(fits[4].wingspan).toBe(65);
    expect([...taxiTooNarrowLines(fits)]).toEqual([0, 4]);
  });

  it('reads the wingspan limit and the pavement of the airport map', () => {
    const features = [
      {
        properties: { feattype: FeatureType.TaxiwayGuidanceLine, idlin: 'N', wingspan: 65 },
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [10, 0],
          ],
        },
      },
      {
        properties: { feattype: FeatureType.TaxiwayGuidanceLine, idlin: 'F', wingspan: -32767 },
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 10],
            [10, 10],
          ],
        },
      },
      {
        properties: { feattype: FeatureType.TaxiwayElement },
        geometry: { type: 'Polygon', coordinates: rectangle(0, 0, 1, 1) },
      },
      {
        properties: { feattype: FeatureType.ApronElement },
        geometry: { type: 'MultiPolygon', coordinates: [rectangle(0, 0, 1, 1), rectangle(2, 2, 3, 3)] },
      },
      {
        properties: { feattype: FeatureType.TaxiwayShoulder },
        geometry: { type: 'Polygon', coordinates: rectangle(0, 0, 1, 1) },
      },
    ];
    expect(taxiLinesFromAmdb(features).map((l) => l.wingspan)).toEqual([65, undefined]);
    expect(taxiPavementFromAmdb(features).length).toBe(3);
  });

  it('keeps the route off the lines too narrow when it can, flags a clearance that needs one', () => {
    // From the stand, N (23 m) is the short way to the runway entry S; F (25 m) goes round
    const lines = [
      line(TaxiLineKind.Taxiway, 'N', [0, 0], [200, 0]),
      line(TaxiLineKind.Taxiway, 'F', [0, 0], [0, 100], [200, 100], [200, 0]),
      line(TaxiLineKind.Taxiway, 'S', [200, 0], [400, 0]),
      line(TaxiLineKind.Runway, '09.27', [400, -2000], [400, 2000]),
      line(TaxiLineKind.Stand, '1', [0, 0], [0, -50]),
    ];
    const network = buildTaxiNetwork(lines);
    const tooNarrow = new Set([0]);
    const start = { kind: 'position' as const, point: [0, -50] as TaxiPoint, heading: null };
    const to = { kind: 'runway' as const, runway: '09', entry: 'S', point: [400, 0] as TaxiPoint };
    expect(taxiRoute(network, { start, to }).taxiways).toEqual(['N', 'S']);
    expect(taxiRoute(network, { start, to, tooNarrow }).taxiways).toEqual(['F', 'S']);
    expect(taxiRoute(network, { start, to, via: ['F'], tooNarrow }).taxiways).toEqual(['F', 'S']);
    // Cleared along N: followed, the leg on N is there to flag
    const cleared = taxiRoute(network, { start, to, via: ['N'], tooNarrow });
    expect(cleared.error).toBe(TaxiRouteError.None);
    expect(cleared.taxiways).toEqual(['N', 'S']);
    expect(cleared.legs.find((l) => l.name === 'N')?.lines).toEqual([0]);
    // The entry proposed for the departure avoids it too: the same entry, by F
    const entries = [{ name: 'S', point: [400, 0] as TaxiPoint, distance: 0, remaining: 3000 }];
    expect(taxiDefaultEntry(network, [], [], start, '09', entries, tooNarrow)?.name).toBe('S');
  });
});
