// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FeatureType } from '../amdb';
import { LandingRunwayCondition } from './landing';
import { assessBtvExits, BtvAmdbFeature, BtvExitStatus, runwayExitsFromAmdb } from './btvExits';

const exitLine = (name: string, coordinates: [number, number][]): BtvAmdbFeature => ({
  properties: { feattype: FeatureType.RunwayExitLine, idlin: name },
  geometry: { type: 'LineString', coordinates },
});

/** Runway 09/27, 3000 m along the x axis, threshold 09 at the origin */
const FEATURES: BtvAmdbFeature[] = [
  {
    properties: { feattype: FeatureType.RunwayThreshold, idthr: '9' },
    geometry: { type: 'Point', coordinates: [0, 0] },
  },
  {
    properties: { feattype: FeatureType.RunwayThreshold, idthr: '27' },
    geometry: { type: 'Point', coordinates: [3000, 0] },
  },
  {
    properties: { feattype: FeatureType.PaintedCenterline, idrwy: '9.27' },
    geometry: {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [3000, 0],
      ],
    },
  },
  exitLine('A1', [
    [1000, 20],
    [1060, 200],
  ]),
  // Turns back against the landing direction
  exitLine('B1', [
    [1500, 10],
    [1400, 150],
  ]),
  // Before the touchdown zone
  exitLine('C1', [
    [300, 0],
    [300, 200],
  ]),
  // Not on the runway
  exitLine('D1', [
    [2000, 100],
    [2000, 300],
  ]),
  // Drawn from the taxiway to the runway
  exitLine('E1', [
    [2300, 200],
    [2200, 5],
  ]),
  // A second line of A1, farther
  exitLine('A1', [
    [2600, 0],
    [2700, 150],
  ]),
];

describe('BTV runway exits', () => {
  it('finds the exits of a runway as the OANS does', () => {
    expect(runwayExitsFromAmdb(FEATURES, '09')).toEqual([
      { name: 'A1', distance: 1000, start: [1000, 20] },
      { name: 'E1', distance: 2200, start: [2200, 5] },
    ]);
    // Landing on 27: B1 and C1 do not turn back any more, the second A1 line does
    expect(runwayExitsFromAmdb(FEATURES, '27')?.map(({ name, distance }) => ({ name, distance }))).toEqual([
      { name: 'E1', distance: 800 },
      { name: 'B1', distance: 1500 },
      { name: 'A1', distance: 2000 },
      { name: 'C1', distance: 2700 },
    ]);
    expect(runwayExitsFromAmdb(FEATURES, '18')).toBeNull();
  });

  it('measures the exits along and across a runway in any direction', () => {
    // Runway 05/23, 2500 m at 50° from the x axis, threshold 05 away from the origin: a point `along` metres down the
    // runway and `across` metres to the side (positive to the left)
    const thr: [number, number] = [1200, -700];
    const ux = Math.cos((50 * Math.PI) / 180);
    const uy = Math.sin((50 * Math.PI) / 180);
    const at = (along: number, across: number): [number, number] => [
      thr[0] + along * ux - across * uy,
      thr[1] + along * uy + across * ux,
    ];
    const features: BtvAmdbFeature[] = [
      {
        properties: { feattype: FeatureType.RunwayThreshold, idthr: '05' },
        geometry: { type: 'Point', coordinates: thr },
      },
      {
        properties: { feattype: FeatureType.PaintedCenterline, idrwy: '05.23' },
        geometry: { type: 'LineString', coordinates: [thr, at(2500, 0)] },
      },
      // 40 m to the left and 45 m to the right of the centreline: exits; 60 m off: not on the runway
      exitLine('L1', [at(1200, 40), at(1300, 200)]),
      exitLine('R1', [at(1800, -45), at(1900, -200)]),
      exitLine('X1', [at(2000, 60), at(2100, 200)]),
    ];

    const exits = runwayExitsFromAmdb(features, '05');
    expect(exits?.map((e) => e.name)).toEqual(['L1', 'R1']);
    expect(exits![0].distance).toBeCloseTo(1200, 6);
    expect(exits![1].distance).toBeCloseTo(1800, 6);
  });

  it('assesses the exits with the DRY and WET lines and the runway condition', () => {
    const exits = [
      { name: 'A1', distance: 1000 },
      { name: 'B1', distance: 1600 },
      { name: 'E1', distance: 2200 },
      { name: 'F1', distance: 2600 },
    ];
    const lines = { touchdown: 400, dry: 1400, wet: 1900 };
    expect(assessBtvExits(exits, lines, LandingRunwayCondition.Dry).map((e) => e.status)).toEqual([
      BtvExitStatus.NotAchievable,
      BtvExitStatus.DryOnly,
      BtvExitStatus.Recommended,
      BtvExitStatus.BeyondWet,
    ]);
    expect(assessBtvExits(exits, lines, LandingRunwayCondition.Wet).map((e) => e.status)).toEqual([
      BtvExitStatus.NotAchievable,
      BtvExitStatus.NotAchievable,
      BtvExitStatus.Recommended,
      BtvExitStatus.BeyondWet,
    ]);
    // BTV is prohibited on a contaminated runway
    expect(assessBtvExits(exits, lines, LandingRunwayCondition.Water6mm)).toBeNull();
  });

  it('sorts the exits and takes an exit right at a line as reachable', () => {
    const lines = { touchdown: 400, dry: 1400, wet: 1900 };
    const exits = [
      { name: 'W', distance: 1900 },
      { name: 'D', distance: 1400 },
      { name: 'A', distance: 900 },
    ];
    expect(assessBtvExits(exits, lines, LandingRunwayCondition.Dry).map((e) => [e.name, e.status])).toEqual([
      ['A', BtvExitStatus.NotAchievable],
      ['D', BtvExitStatus.DryOnly],
      ['W', BtvExitStatus.Recommended],
    ]);
  });

  it('ignores the features that are not a usable exit line, and a runway without its threshold or centreline', () => {
    const broken: BtvAmdbFeature[] = [
      ...FEATURES,
      // an exit line without its name, one with a single point, and an exit drawn as a point
      {
        properties: { feattype: FeatureType.RunwayExitLine },
        geometry: {
          type: 'LineString',
          coordinates: [
            [1200, 0],
            [1250, 100],
          ],
        },
      },
      exitLine('G1', [[1700, 0]]),
      {
        properties: { feattype: FeatureType.RunwayExitLine, idlin: 'H1' },
        geometry: { type: 'Point', coordinates: [1800, 0] },
      },
      // a taxiway line on the runway is not an exit
      {
        properties: { feattype: FeatureType.PaintedCenterline, idlin: 'T1' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [1900, 0],
            [1950, 100],
          ],
        },
      },
    ];
    expect(runwayExitsFromAmdb(broken, '09')?.map((e) => e.name)).toEqual(['A1', 'E1']);
    expect(
      runwayExitsFromAmdb(
        FEATURES.filter((f) => f.properties.feattype !== FeatureType.RunwayThreshold),
        '09',
      ),
    ).toBeNull();
    expect(
      runwayExitsFromAmdb(
        FEATURES.filter((f) => f.properties.feattype !== FeatureType.PaintedCenterline),
        '09',
      ),
    ).toBeNull();
  });
});
