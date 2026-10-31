// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runwaysOfAirport } from './Runways';
import { landingDistanceAvailable } from './runwayLda';

// only the designator letters are needed, not the whole flyPad SDK
vi.mock('@flybywiresim/fbw-sdk-react', () => ({
  RunwayDesignatorChar: { None: 0, L: 1, R: 2, C: 3, W: 4, A: 5, B: 6 },
}));

type RawAirportArg = Parameters<typeof runwaysOfAirport>[0];

/** One runway 09/27 of 3000 m with a displaced threshold of 400 m at the 09 end only */
const AIRPORT = {
  lat: 50,
  lon: 8,
  runways: [
    {
      designation: '9-27',
      designatorCharPrimary: 0,
      designatorCharSecondary: 0,
      direction: 90,
      length: 3000,
      elevation: 100,
      primaryElevation: 100,
      secondaryElevation: 100,
      primaryThresholdLength: 400,
      secondaryThresholdLength: 0,
    },
  ],
} as unknown as RawAirportArg;

describe('runways of an airport', () => {
  beforeEach(() => {
    vi.stubGlobal('Facilities', { getMagVar: () => 0 });
  });

  it('gives each end its own displaced threshold', () => {
    const [primary, secondary] = runwaysOfAirport(AIRPORT, 'EDDF');
    expect(primary.ident).toBe('09');
    expect(primary.displacedThreshold).toBe(400);
    expect(secondary.ident).toBe('27');
    expect(secondary.displacedThreshold).toBe(0);
  });

  it('lands 400 m shorter on the end with the displaced threshold and on the full length the other way', () => {
    const [primary, secondary] = runwaysOfAirport(AIRPORT, 'EDDF');
    expect(landingDistanceAvailable(primary)).toBe(2600);
    expect(landingDistanceAvailable(secondary)).toBe(3000);
  });
});
