// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { assessLandingWind, rankRunwaysByWind, runwayWindComponents } from './landingWind';

const A380_DRY = { crosswind: 40, tailwind: 10 };

describe('runwayWindComponents', () => {
  it('splits the wind into headwind and crosswind, the side the wind comes from', () => {
    const w = runwayWindComponents(237, 330, 45);
    expect(w.headwind).toBeCloseTo(-2.36, 2);
    expect(w.crosswind).toBeCloseTo(44.94, 2);
    expect(w.side).toBe('R');
    expect(runwayWindComponents(57, 330, 45).side).toBe('L');
  });

  it('gives a pure tailwind for the wind from behind, across north', () => {
    const w = runwayWindComponents(237, 57, 13);
    expect(w.headwind).toBeCloseTo(-13, 6);
    expect(w.crosswind).toBeCloseTo(0, 6);
    expect(w.side).toBe('');
    expect(runwayWindComponents(350, 10, 20).headwind).toBeCloseTo(18.79, 2);
    expect(runwayWindComponents(350, 10, 20).side).toBe('R');
  });
});

describe('assessLandingWind', () => {
  it('compares the whole knots with the limits', () => {
    expect(assessLandingWind({ headwind: 0, crosswind: 40.4 }, A380_DRY).crosswindExceeded).toBe(false);
    expect(assessLandingWind({ headwind: 0, crosswind: 40.6 }, A380_DRY).crosswindExceeded).toBe(true);
    expect(assessLandingWind({ headwind: -10.4, crosswind: 0 }, A380_DRY).tailwindExceeded).toBe(false);
    expect(assessLandingWind({ headwind: -13, crosswind: 0 }, A380_DRY).tailwindExceeded).toBe(true);
    expect(assessLandingWind({ headwind: 30, crosswind: 0 }, A380_DRY)).toEqual({
      crosswindExceeded: false,
      tailwindExceeded: false,
    });
  });
});

describe('rankRunwaysByWind', () => {
  // CYUL, magnetic bearings
  const cyul = [
    { ident: '24R', magneticBearing: 237 },
    { ident: '06L', magneticBearing: 57 },
    { ident: '10', magneticBearing: 97 },
    { ident: '28', magneticBearing: 277 },
  ];

  it('puts the runways within the limits first, then the least above them', () => {
    const ranked = rankRunwaysByWind(cyul, 330, 45, 45, A380_DRY);
    expect(ranked.map((r) => r.runway.ident)).toEqual(['28', '24R', '06L', '10']);
    expect(ranked[0].within).toBe(true);
    expect(ranked[0].wind.crosswind).toBeCloseTo(35.94, 2);
    expect(ranked[1].crosswindExceeded).toBe(true);
    expect(ranked[3].tailwindExceeded).toBe(true);
    expect(ranked[3].index).toBe(2);
  });

  it('prefers the most headwind among the runways within the limits', () => {
    const ranked = rankRunwaysByWind(cyul, 250, 10, 10, A380_DRY);
    expect(ranked.map((r) => r.runway.ident)).toEqual(['24R', '28', '10', '06L']);
    expect(ranked.every((r) => r.within)).toBe(true);
  });

  it('checks the limits with the gusts', () => {
    const steady = rankRunwaysByWind([{ magneticBearing: 277 }], 330, 45, 45, A380_DRY);
    const gusty = rankRunwaysByWind([{ magneticBearing: 277 }], 330, 45, 55, A380_DRY);
    expect(steady[0].within).toBe(true);
    expect(gusty[0].within).toBe(false);
    expect(gusty[0].crosswindExceeded).toBe(true);
    expect(gusty[0].wind.crosswind).toBeCloseTo(35.94, 2);
    expect(gusty[0].gustWind.crosswind).toBeCloseTo(43.92, 2);
  });

  it('takes a variable wind from the worst direction', () => {
    const light = rankRunwaysByWind(cyul, 'VRB', 3, 3, A380_DRY);
    expect(light.every((r) => r.within)).toBe(true);
    expect(light[0].wind).toEqual({ headwind: -3, crosswind: 3, side: '' });
    const strong = rankRunwaysByWind(cyul, 'VRB', 12, 12, A380_DRY);
    expect(strong.every((r) => r.tailwindExceeded && !r.crosswindExceeded)).toBe(true);
  });

  it('ignores a gust below the steady wind', () => {
    expect(rankRunwaysByWind([{ magneticBearing: 277 }], 330, 45, 0, A380_DRY)[0].gustWind.crosswind).toBeCloseTo(
      35.94,
      2,
    );
  });
});
