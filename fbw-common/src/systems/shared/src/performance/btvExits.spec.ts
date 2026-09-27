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
      { name: 'A1', distance: 1000 },
      { name: 'E1', distance: 2200 },
    ]);
    // Landing on 27: B1 and C1 do not turn back any more, the second A1 line does
    expect(runwayExitsFromAmdb(FEATURES, '27')).toEqual([
      { name: 'E1', distance: 800 },
      { name: 'B1', distance: 1500 },
      { name: 'A1', distance: 2000 },
      { name: 'C1', distance: 2700 },
    ]);
    expect(runwayExitsFromAmdb(FEATURES, '18')).toBeNull();
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
});
