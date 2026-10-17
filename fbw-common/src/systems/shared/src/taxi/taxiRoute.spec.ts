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
import { taxiDefaultEntry, taxiRouteToHoldingPoint, taxiRunwayEntries } from './taxiDeparture';
import { buildTaxiNetwork, TaxiLine, TaxiLineKind, TaxiPoint } from './taxiNetwork';
import {
  parseTaxiClearance,
  readTaxiClearance,
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
    expect(taxiRoute(NETWORK, { start: FROM_B1, to: STAND_42, via: parseTaxiClearance('a, k-m') }).taxiways).toEqual([
      'A',
      'K',
      'M',
    ]);
    // Wrong order; only A (X is no taxiway of the map, left out), which does not lead to the stand
    for (const via of [
      ['M', 'K', 'A'],
      ['A', 'X'],
    ]) {
      expect(taxiRoute(NETWORK, { start: FROM_B1, to: STAND_42, via }).error).toBe(TaxiRouteError.NoRoute);
    }
    // A taxiway missing between two cleared ones: the short connector K (600 m) joins them
    expect(taxiRoute(NETWORK, { start: FROM_B1, to: STAND_42, via: ['A', 'M'] }).taxiways).toEqual(['A', 'K', 'M']);
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

  it('reads the taxiway names of several words of the airport in a clearance', () => {
    const names = ['A', 'EAST', 'SOUTH RAMP', 'NORTH RAMP'];
    expect(parseTaxiClearance('EAST SOUTH RAMP NORTH RAMP A4 A A3 L R', names)).toEqual([
      'EAST',
      'SOUTH RAMP',
      'NORTH RAMP',
      'A4',
      'A',
      'A3',
      'L',
      'R',
    ]);
    // Without the airport names, one word is one taxiway
    expect(parseTaxiClearance('south ramp, A')).toEqual(['SOUTH', 'RAMP', 'A']);

    const network = buildTaxiNetwork([
      line(TaxiLineKind.Taxiway, 'SOUTH RAMP', [0, 0], [500, 0]),
      line(TaxiLineKind.Taxiway, 'A', [500, 0], [500, 500]),
      line(TaxiLineKind.Stand, '1', [500, 500], [500, 550]),
    ]);
    const route = taxiRoute(network, {
      start: { kind: 'position', point: [10, 0], heading: 90 },
      to: { kind: 'stand', name: '1', point: [500, 555] },
      via: parseTaxiClearance('SOUTH RAMP A', ['SOUTH RAMP', 'A']),
    });
    expect(route.error).toBe(TaxiRouteError.None);
    expect(route.taxiways).toEqual(['SOUTH RAMP', 'A']);
  });

  it('proposes the first runway entry reached without crossing a runway', () => {
    // Runway 09/27 (x 0 to 3000): A on the north side ends on the runway at x 2600; the full length entry of 27, R,
    // is on the south side, reached from A only across the runway along the exit lines A3 and L (as at CYUL 24L)
    const network = buildTaxiNetwork([
      line(TaxiLineKind.Taxiway, 'A', [0, 200], [2600, 200], [2600, 0]),
      line(TaxiLineKind.Exit, 'A3', [2500, 200], [2500, -200]),
      line(TaxiLineKind.Exit, 'L', [2500, -200], [3050, -200]),
      line(TaxiLineKind.Taxiway, 'R', [3050, -200], [3050, 0]),
      line(TaxiLineKind.Runway, '09.27', [0, 0], [3000, 0]),
    ]);
    const runways = [
      {
        name: '09/27',
        polygons: [
          [
            [0, -30],
            [3000, -30],
            [3000, 30],
            [0, 30],
          ] as TaxiPoint[],
        ],
      },
    ];
    const entries = taxiRunwayEntries(network, { ident: '27', threshold: [3000, 0], end: [0, 0] });
    expect(entries[0].name).toBe('R');
    const start = { kind: 'position' as const, point: [1000, 200] as TaxiPoint, heading: 90 };
    expect(taxiDefaultEntry(network, runways, [], start, '27', entries)?.name).toBe('A');
    // Every entry across the runway: the full length one
    const south = { kind: 'position' as const, point: [2800, -200] as TaxiPoint, heading: 90 };
    expect(taxiDefaultEntry(network, runways, [], south, '27', entries)?.name).toBe('R');
  });
});

/**
 * A departure to runway 34R as at RJTT: the aircraft pushed back from gate 67 onto the apron line L4 (facing
 * north-east); A4B and W4 lead to the parallel taxiway W; then A, E and the entry C1 (a runway exit line of the airport
 * map) onto 34R. ATC cleared "via L4, A4B, W4, W, A, E, C1"; the crew typed "W A E C1 C1".
 */
const RJTT_LINES: TaxiLine[] = [
  line(TaxiLineKind.Stand, '67', [0, -60], [0, 0]),
  line(TaxiLineKind.Taxiway, 'L4', [-200, 0], [300, 0]),
  line(TaxiLineKind.Taxiway, 'A4B', [300, 0], [300, 300]),
  line(TaxiLineKind.Taxiway, 'W4', [300, 300], [600, 300]),
  line(TaxiLineKind.Taxiway, 'W', [600, -500], [600, 1500]),
  line(TaxiLineKind.Taxiway, 'A', [600, 1500], [1200, 1500]),
  line(TaxiLineKind.Taxiway, 'E', [1200, 1500], [1200, 0]),
  line(TaxiLineKind.Exit, 'C1', [1200, 0], [1500, 0]),
  line(TaxiLineKind.Runway, '16L.34R', [1500, -2000], [1500, 2000]),
];
const RJTT = buildTaxiNetwork(RJTT_LINES);
const RJTT_NAMES = ['67', 'L4', 'A4B', 'W4', 'W', 'A', 'E', 'C1'];
const TO_34R_C1 = { kind: 'runway' as const, runway: '34R', entry: 'C1', point: [1500, 0] as TaxiPoint };
const PUSHED_BACK = { kind: 'position' as const, point: [50, 0] as TaxiPoint, heading: 45 };
const FULL_ROUTE = ['L4', 'A4B', 'W4', 'W', 'A', 'E', 'C1'];

describe('Taxi route along an ATC clearance', () => {
  it('takes the first taxiways from the aircraft when the clearance leaves them out', () => {
    const route = taxiRoute(RJTT, { start: PUSHED_BACK, to: TO_34R_C1, via: ['W', 'A', 'E'] });
    expect(route.error).toBe(TaxiRouteError.None);
    expect(route.taxiways).toEqual(FULL_ROUTE);
  });

  it('reads a cleared runway entry that is a runway exit line of the airport map', () => {
    const onW = { kind: 'position' as const, point: [600, 0] as TaxiPoint, heading: 0 };
    const route = taxiRoute(RJTT, { start: onW, to: TO_34R_C1, via: ['W', 'A', 'E', 'C1'] });
    expect(route.error).toBe(TaxiRouteError.None);
    expect(route.taxiways).toEqual(['W', 'A', 'E', 'C1']);
    // After landing, a clearance that starts with the exit the aircraft is on
    const fromB1 = taxiRoute(NETWORK, { start: FROM_B1, to: STAND_42, via: ['B1', 'A', 'K', 'M'] });
    expect(fromB1.error).toBe(TaxiRouteError.None);
    expect(fromB1.taxiways).toEqual(['A', 'K', 'M']);
  });

  it('accepts the holding point typed twice (taxiway and runway entry)', () => {
    const onW = { kind: 'position' as const, point: [600, 0] as TaxiPoint, heading: 0 };
    expect(taxiRoute(RJTT, { start: onW, to: TO_34R_C1, via: ['W', 'A', 'E', 'C1', 'C1'] }).error).toBe(
      TaxiRouteError.None,
    );
    // The user's entry, from the aircraft after pushback
    const route = taxiRoute(RJTT, {
      start: PUSHED_BACK,
      to: TO_34R_C1,
      via: parseTaxiClearance('W A E C1 C1', RJTT_NAMES),
    });
    expect(route.error).toBe(TaxiRouteError.None);
    expect(route.taxiways).toEqual(FULL_ROUTE);
  });

  it('reads the ATC instruction pasted as it is said', () => {
    const atc = 'via L4 cross runway 34L, taxi to holding point C1, runway 34R, via L4, A4B, W4, W, A, E, C1.';
    expect(parseTaxiClearance(atc, RJTT_NAMES)).toEqual(FULL_ROUTE);
    expect(readTaxiClearance(atc, RJTT_NAMES).crossings).toEqual(['34L']);
    const route = taxiRoute(RJTT, { start: PUSHED_BACK, to: TO_34R_C1, via: parseTaxiClearance(atc, RJTT_NAMES) });
    expect(route.error).toBe(TaxiRouteError.None);
    expect(route.taxiways).toEqual(FULL_ROUTE);
    // Other phrasings: the clearance limit first, a stand, a frequency, hold short of a runway
    expect(parseTaxiClearance('Taxi to holding point C1 via W, A and E', RJTT_NAMES)).toEqual(['W', 'A', 'E', 'C1']);
    expect(parseTaxiClearance('taxi to stand 67 via E, A, W hold short of runway 16L', RJTT_NAMES)).toEqual([
      'E',
      'A',
      'W',
    ]);
    expect(readTaxiClearance('hold short of runway 16L', RJTT_NAMES).crossings).toEqual([]);
    expect(parseTaxiClearance('W A, contact ground 121.7', RJTT_NAMES)).toEqual(['W', 'A']);
    expect(readTaxiClearance('cross runways 4 and 34L via W', RJTT_NAMES)).toEqual({
      taxiways: ['W'],
      crossings: ['04', '34L'],
    });
    // A name of the airport typed with a separator
    expect(parseTaxiClearance('A-4B W4', RJTT_NAMES)).toEqual(['A4B', 'W4']);
  });

  it('keeps the cleared taxiways strictly in their order', () => {
    // A out of its order; W to C1 without A and E (2100 m): no short connector
    for (const via of [
      ['A', 'W', 'E'],
      ['W', 'C1'],
    ]) {
      expect(taxiRoute(RJTT, { start: PUSHED_BACK, to: TO_34R_C1, via }).error).toBe(TaxiRouteError.NoRoute);
    }
  });

  it('leaves out the cleared names that are not taxiways of the airport map', () => {
    // An airport map without A4B and W4 (user report 2026-10-14: "Not a taxiway of the airport map: A4B, W4" and no
    // route at all): here L4 meets W
    const network = buildTaxiNetwork([
      ...RJTT_LINES.filter((l) => l.name !== 'L4' && l.name !== 'A4B' && l.name !== 'W4'),
      line(TaxiLineKind.Taxiway, 'L4', [-200, 0], [600, 0]),
    ]);
    const names = RJTT_NAMES.filter((n) => n !== 'A4B' && n !== 'W4');
    const atc = 'via L4 cross runway 34L, taxi to holding point C1, runway 34R, via L4, A4B, W4, W, A, E, C1.';
    const route = taxiRoute(network, { start: PUSHED_BACK, to: TO_34R_C1, via: parseTaxiClearance(atc, names) });
    expect(route.error).toBe(TaxiRouteError.None);
    expect(route.taxiways).toEqual(['L4', 'W', 'A', 'E', 'C1']);
    // A typing error after the last taxiway: the route along the others
    expect(taxiRoute(RJTT, { start: PUSHED_BACK, to: TO_34R_C1, via: ['W', 'A', 'E', 'X9'] }).taxiways).toEqual(
      FULL_ROUTE,
    );
    // No cleared name is a taxiway of the map: no route along the clearance
    expect(taxiRoute(RJTT, { start: PUSHED_BACK, to: TO_34R_C1, via: ['X8', 'X9'] }).error).toBe(
      TaxiRouteError.NoRoute,
    );
  });

  /**
   * W, then A (y 1500) ends short of E (x 1200), joined by the connector A9 the clearance leaves out (at RJTT, user
   * report 2026-10-14, A does not meet E); C1 enters runway 34R. aEnd: where A ends (the connector is 1200 - aEnd long).
   */
  const gapMap = (aEnd: number) =>
    buildTaxiNetwork([
      line(TaxiLineKind.Taxiway, 'W', [0, -500], [0, 1500]),
      line(TaxiLineKind.Taxiway, 'A', [0, 1500], [aEnd, 1500]),
      line(TaxiLineKind.Taxiway, 'A9', [aEnd, 1500], [1200, 1500]),
      line(TaxiLineKind.Taxiway, 'E', [1200, 1500], [1200, 0]),
      line(TaxiLineKind.Exit, 'C1', [1200, 0], [1500, 0]),
      line(TaxiLineKind.Runway, '16L.34R', [1500, -2000], [1500, 2000]),
    ]);
  const ON_W = { kind: 'position' as const, point: [0, 0] as TaxiPoint, heading: 0 };

  it('joins two cleared taxiways along a short connector the clearance leaves out', () => {
    const route = taxiRoute(gapMap(1000), { start: ON_W, to: TO_34R_C1, via: ['W', 'A', 'E', 'C1'] });
    expect(route.error).toBe(TaxiRouteError.None);
    expect(route.taxiways).toEqual(['W', 'A', 'A9', 'E', 'C1']);
    // An 800 m connector is a taxiway the clearance would name
    expect(taxiRoute(gapMap(400), { start: ON_W, to: TO_34R_C1, via: ['W', 'A', 'E', 'C1'] }).error).toBe(
      TaxiRouteError.NoRoute,
    );
  });

  it('crosses a runway on a connector between two cleared taxiways only when cleared to', () => {
    // From the end of A (x 1000) to E: X1 straight across runway 16R/34L (x 1100), X2 round its end (500 m)
    const network = buildTaxiNetwork([
      line(TaxiLineKind.Taxiway, 'W', [0, -500], [0, 1500]),
      line(TaxiLineKind.Taxiway, 'A', [0, 1500], [1000, 1500]),
      line(TaxiLineKind.Taxiway, 'X1', [1000, 1500], [1200, 1500]),
      line(TaxiLineKind.Taxiway, 'X2', [1000, 1500], [1000, 1650], [1200, 1650], [1200, 1500]),
      line(TaxiLineKind.Taxiway, 'E', [1200, 1500], [1200, 0]),
      line(TaxiLineKind.Exit, 'C1', [1200, 0], [1500, 0]),
      line(TaxiLineKind.Runway, '16R.34L', [1100, 1000], [1100, 1600]),
      line(TaxiLineKind.Runway, '16L.34R', [1500, -2000], [1500, 2000]),
    ]);
    const via = ['W', 'A', 'E', 'C1'];
    expect(taxiRoute(network, { start: ON_W, to: TO_34R_C1, via }).taxiways).toEqual(['W', 'A', 'X2', 'E', 'C1']);
    expect(taxiRoute(network, { start: ON_W, to: TO_34R_C1, via, crossRunways: ['34L'] }).taxiways).toEqual([
      'W',
      'A',
      'X1',
      'E',
      'C1',
    ]);
  });

  it('takes the first taxiways only near the start', () => {
    const network = buildTaxiNetwork([
      line(TaxiLineKind.Taxiway, 'X', [0, 0], [2500, 0]),
      line(TaxiLineKind.Taxiway, 'W', [2500, 0], [2500, 500]),
      line(TaxiLineKind.Stand, '1', [2500, 500], [2500, 550]),
    ]);
    const to = { kind: 'stand' as const, name: '1', point: [2500, 555] as TaxiPoint };
    const far = { kind: 'position' as const, point: [10, 0] as TaxiPoint, heading: 90 };
    const near = { kind: 'position' as const, point: [1500, 0] as TaxiPoint, heading: 90 };
    // X is the line the aircraft is on: no limit along it
    expect(taxiRoute(network, { start: far, to, via: ['W'] }).error).toBe(TaxiRouteError.None);
    const viaY = buildTaxiNetwork([
      line(TaxiLineKind.Taxiway, 'Y', [0, 0], [100, 0]),
      line(TaxiLineKind.Taxiway, 'X', [100, 0], [2500, 0]),
      line(TaxiLineKind.Taxiway, 'W', [2500, 0], [2500, 500]),
      line(TaxiLineKind.Stand, '1', [2500, 500], [2500, 550]),
    ]);
    // Along Y, then 2400 m of X before the first cleared taxiway: too far to be the way out of the stand
    expect(taxiRoute(viaY, { start: far, to, via: ['W'] }).error).toBe(TaxiRouteError.NoRoute);
    expect(taxiRoute(viaY, { start: near, to, via: ['W'] }).error).toBe(TaxiRouteError.None);
  });

  it('crosses a runway before the first cleared taxiway only when cleared to', () => {
    // Runway 16R/34L (x 500) between the aircraft on L and W; P goes round its end
    const network = buildTaxiNetwork([
      line(TaxiLineKind.Taxiway, 'L', [0, 0], [1000, 0]),
      line(TaxiLineKind.Taxiway, 'P', [0, 0], [0, 500], [1000, 500]),
      line(TaxiLineKind.Taxiway, 'W', [1000, 500], [1000, -500]),
      line(TaxiLineKind.Stand, '1', [1000, -500], [1000, -550]),
      line(TaxiLineKind.Runway, '16R.34L', [500, -400], [500, 400]),
    ]);
    const start = { kind: 'position' as const, point: [100, 0] as TaxiPoint, heading: null };
    const to = { kind: 'stand' as const, name: '1', point: [1000, -555] as TaxiPoint };
    expect(taxiRoute(network, { start, to, via: ['W'] }).taxiways).toEqual(['L', 'P', 'W']);
    expect(taxiRoute(network, { start, to, via: ['W'], crossRunways: ['34L'] }).taxiways).toEqual(['L', 'W']);
  });
});
