// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FeatureType } from '../amdb';
import {
  taxiFindStand,
  taxiLinesFromAmdb,
  taxiRunwaysFromAmdb,
  taxiStandMatches,
  taxiStandsFromAmdb,
  TaxiStand,
} from './taxiAmdb';
import { taxiRouteToHoldingPoint, taxiRunwayEntries } from './taxiDeparture';
import { buildTaxiNetwork, TaxiLine, TaxiLineKind, TaxiPoint } from './taxiNetwork';
import {
  parseTaxiClearance,
  taxiRoute,
  TaxiRouteError,
  taxiRouteFlagPoints,
  taxiRouteRunwayCrossings,
} from './taxiRoute';

const line = (kind: TaxiLineKind, name: string | null, ...points: TaxiPoint[]): TaxiLine => ({ kind, name, points });

/**
 * Runway 09/27 along y = 0 (x 0 to 3000); taxiway A parallel at y = 200; exits B1 and B2 from the runway to A;
 * K (x 1500) and L (x 2500) from A to M (y 800); C crosses the runway at x 500 and ends on A; stands 42 and 43 on M;
 * stand 44 behind stand 44R, its lead-in line is the one of 44R (a stand with an alternative position).
 */
const LINES: TaxiLine[] = [
  line(TaxiLineKind.Taxiway, 'A', [0, 200], [3000, 200]),
  line(TaxiLineKind.Exit, 'B1', [1000, 0], [1100, 200]),
  line(TaxiLineKind.Exit, 'B2', [2000, 0], [2100, 200]),
  line(TaxiLineKind.Taxiway, 'K', [1500, 200], [1500, 500], [1500, 800]),
  line(TaxiLineKind.Taxiway, 'L', [2500, 201], [2500, 800]),
  line(TaxiLineKind.Taxiway, 'M', [1500, 800], [2500, 800]),
  line(TaxiLineKind.Taxiway, 'C', [500, -300], [500, 198]),
  // Entry at the threshold of 09; D crosses the runway; an unnamed lead-on line from A
  line(TaxiLineKind.Taxiway, 'S1', [60, 200], [60, 0]),
  line(TaxiLineKind.Taxiway, 'D', [1500, -300], [1500, 200]),
  line(TaxiLineKind.Taxiway, null, [2400, 200], [2400, 0]),
  line(TaxiLineKind.Runway, '09.27', [0, 0], [3000, 0]),
  line(TaxiLineKind.Stand, '42', [2000, 800], [2000, 900]),
  line(TaxiLineKind.Stand, '43', [1700, 800], [1700, 900]),
  line(TaxiLineKind.Stand, '44R', [2300, 800], [2300, 850]),
  line(TaxiLineKind.Stand, '44', [2300, 850], [2300, 900]),
];
const NETWORK = buildTaxiNetwork(LINES);
const STAND_42 = { kind: 'stand' as const, name: '42', point: [2000, 905] as TaxiPoint };
const FROM_B1 = { kind: 'exit' as const, exit: 'B1', point: [1000, 0] as TaxiPoint };

describe('Taxi route', () => {
  it('suggests the shortest route from a runway exit to a stand', () => {
    const route = taxiRoute(NETWORK, { start: FROM_B1, to: STAND_42 });
    expect(route.error).toBe(TaxiRouteError.None);
    expect(route.taxiways).toEqual(['A', 'K', 'M']);
    expect(route.legs.map((l) => l.name)).toEqual(['B1', 'A', 'K', 'M', '42']);
    // B1 224 m, A 400 m, K 600 m, M 500 m, stand line 100 m, to the stand 5 m
    expect(route.length).toBeCloseTo(Math.hypot(100, 200) + 400 + 600 + 500 + 100 + 5, 0);
    expect(route.points[0]).toEqual([1000, 0]);
    expect(route.points[route.points.length - 1]).toEqual([2000, 905]);
  });

  it('follows the cleared taxiways in their order', () => {
    expect(taxiRoute(NETWORK, { start: FROM_B1, to: STAND_42, via: ['A', 'L', 'M'] }).taxiways).toEqual([
      'A',
      'L',
      'M',
    ]);
    // The typed clearance
    expect(taxiRoute(NETWORK, { start: FROM_B1, to: STAND_42, via: parseTaxiClearance('a, k-m') }).taxiways).toEqual([
      'A',
      'K',
      'M',
    ]);
    // No such taxiway, wrong order, a taxiway missing
    for (const via of [
      ['A', 'X'],
      ['M', 'K', 'A'],
      ['A', 'M'],
    ]) {
      expect(taxiRoute(NETWORK, { start: FROM_B1, to: STAND_42, via }).error).toBe(TaxiRouteError.NoRoute);
    }
  });

  it('starts from the aircraft, preferring its heading', () => {
    // On M between the stands, facing west: straight on to stand 42
    const west = taxiRoute(NETWORK, {
      start: { kind: 'position', point: [2200, 800], heading: 270 },
      to: STAND_42,
    });
    expect(west.taxiways).toEqual(['M']);
    expect(west.length).toBeCloseTo(200 + 105, 0);
    // Facing away from the stand: no U-turn at the next junction through the aircraft position
    const away = taxiRoute(NETWORK, {
      start: { kind: 'position', point: [1900, 800], heading: 270 },
      to: STAND_42,
    });
    expect(away.taxiways).toEqual(['M']);
    expect(away.length).toBeCloseTo(100 + 105, 0);
    expect(
      taxiRoute(NETWORK, { start: { kind: 'position', point: [5000, 5000], heading: null }, to: STAND_42 }).error,
    ).toBe(TaxiRouteError.NoStart);
  });

  it('reports a stand or an exit that is not on the network', () => {
    expect(taxiRoute(NETWORK, { start: FROM_B1, to: { kind: 'stand', name: '99', point: [9000, 9000] } }).error).toBe(
      TaxiRouteError.NoStand,
    );
    expect(taxiRoute(NETWORK, { start: { kind: 'exit', exit: 'Z9', point: [1000, 0] }, to: STAND_42 }).error).toBe(
      TaxiRouteError.NoStart,
    );
  });

  it('goes from a stand to a runway entry and stops at the holding point', () => {
    const entries = taxiRunwayEntries(NETWORK, { ident: '09', threshold: [0, 0], end: [3000, 0] });
    // S1 ends on the runway, C and D cross it, the unnamed line is named after A
    expect(entries.map((e) => [e.name, Math.round(e.distance), Math.round(e.remaining)])).toEqual([
      ['S1', 60, 2940],
      ['C', 500, 2500],
      ['B1', 1000, 2000],
      ['D', 1500, 1500],
      ['B2', 2000, 1000],
      ['A', 2400, 600],
    ]);
    const fromStand = { kind: 'position' as const, point: STAND_42.point, heading: null };
    const toS1 = { kind: 'runway' as const, runway: '09', entry: 'S1', point: entries[0].point };
    const route = taxiRoute(NETWORK, { start: fromStand, to: toS1 });
    expect(route.error).toBe(TaxiRouteError.None);
    expect(route.legs.map((l) => l.name)).toEqual(['42', 'M', 'K', 'A', 'S1']);
    expect(route.taxiways).toEqual(['M', 'K', 'A', 'S1']);
    // The clearance to the holding point leaves the entry out
    expect(taxiRoute(NETWORK, { start: fromStand, to: toS1, via: ['M', 'K', 'A'] }).taxiways).toEqual([
      'M',
      'K',
      'A',
      'S1',
    ]);
    // From a stand whose lead-in is another stand's line (44 behind 44R): the clearance route leaves along that line
    const from44 = { kind: 'position' as const, point: [2300, 905] as TaxiPoint, heading: null };
    const cleared44 = taxiRoute(NETWORK, { start: from44, to: toS1, via: ['M', 'K', 'A'] });
    expect(cleared44.error).toBe(TaxiRouteError.None);
    expect(cleared44.legs.map((l) => l.name)).toEqual(['44', '44R', 'M', 'K', 'A', 'S1']);
    expect(cleared44.taxiways).toEqual(['M', 'K', 'A', 'S1']);
    const held = taxiRouteToHoldingPoint(route, [
      [
        [40, 90],
        [80, 90],
      ],
    ]);
    const [hx, hy] = held.holdingPoint as TaxiPoint;
    expect(hx).toBeCloseTo(60, 6);
    expect(hy).toBeCloseTo(90, 6);
    expect(held.route.points[held.route.points.length - 1]).toBe(held.holdingPoint);
    expect(held.route.length).toBeCloseTo(route.length - 90, 0);
    expect(taxiRouteToHoldingPoint(route, []).holdingPoint).toBeNull();
    // Flags on the OANS: where M, K, A and S1 start, and the holding point
    expect(taxiRouteFlagPoints(held.route).map(([x, y]) => [Math.round(x), Math.round(y)])).toEqual([
      [2000, 800],
      [1500, 800],
      [1500, 200],
      [60, 200],
      [60, 90],
    ]);
    // An intersection departure where the taxiway crosses the runway, the clearance without the entry
    const toD = { kind: 'runway' as const, runway: '09', entry: 'D', point: entries[3].point };
    expect(taxiRoute(NETWORK, { start: fromStand, to: toD, via: ['M', 'K'] }).taxiways).toEqual(['M', 'K', 'D']);
  });

  it('lists the runway crossings', () => {
    const runway = {
      name: '09/27',
      polygons: [
        [
          [0, -30],
          [3000, -30],
          [3000, 30],
          [0, 30],
        ] as TaxiPoint[],
      ],
    };
    const crossings = taxiRouteRunwayCrossings(
      [
        [500, -300],
        [500, 198],
      ],
      [runway],
    );
    expect(crossings.map((c) => c.runway)).toEqual(['09/27']);
    // Starting on the runway (at an exit) is not a crossing
    expect(
      taxiRouteRunwayCrossings(
        [
          [1000, 0],
          [1100, 200],
        ],
        [runway],
      ),
    ).toEqual([]);
  });

  it('reads the airport map', () => {
    const features = [
      {
        properties: { feattype: FeatureType.TaxiwayGuidanceLine, idlin: ' a ' },
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [
              [0, 0],
              [10, 0],
            ],
            [
              [10, 0],
              [20, 0],
            ],
          ],
        },
      },
      {
        properties: { feattype: FeatureType.StandGuidanceLine, idstd: '12' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [0, 10],
          ],
        },
      },
      {
        properties: { feattype: FeatureType.ParkingStandLocation, idstd: '12' },
        geometry: { type: 'Point', coordinates: [0, 12] },
      },
      {
        properties: { feattype: FeatureType.ParkingStandLocation, idstd: '2' },
        geometry: { type: 'Point', coordinates: [5, 12] },
      },
      {
        properties: { feattype: FeatureType.RunwayElement, idrwy: '9.27' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
            ],
          ],
        },
      },
    ];
    expect(taxiLinesFromAmdb(features).map((l) => [l.kind, l.name])).toEqual([
      [TaxiLineKind.Taxiway, 'A'],
      [TaxiLineKind.Taxiway, 'A'],
      [TaxiLineKind.Stand, '12'],
    ]);
    expect(taxiStandsFromAmdb(features).map((s) => s.name)).toEqual(['2', '12']);
    expect(taxiRunwaysFromAmdb(features).map((r) => r.name)).toEqual(['09/27']);
  });

  it('finds a stand typed without the zeros or separators of the airport map', () => {
    const stand = (name: string): TaxiStand => ({ name, terminal: null, point: [0, 0] });
    const stands = ['016', 'S16', '116', '16A', 'W-2'].map(stand);
    expect(taxiFindStand(stands, '16')?.name).toEqual('016');
    expect(taxiFindStand(stands, 'w2')?.name).toEqual('W-2');
    expect(taxiFindStand(stands, '17')).toBeNull();
    expect(taxiStandMatches(stands, '16', 8).map((s) => s.name)).toEqual(['016', '16A', 'S16', '116']);
  });

  it('joins a lead-in line that stops short of the taxi line', () => {
    const network = buildTaxiNetwork([
      line(TaxiLineKind.Taxiway, 'A', [0, 0], [100, 0]),
      line(TaxiLineKind.Stand, '5', [50, 8], [50, 60]),
      line(TaxiLineKind.Stand, '6', [80, 30], [80, 60]),
    ]);
    const route = taxiRoute(network, {
      start: { kind: 'position', point: [10, 0], heading: 90 },
      to: { kind: 'stand', name: '5', point: [50, 62] },
    });
    expect(route.error).toEqual(TaxiRouteError.None);
    expect(route.taxiways).toEqual(['A']);
    expect(route.length).toBeCloseTo(40 + 8 + 52 + 2, 3);
  });
});
