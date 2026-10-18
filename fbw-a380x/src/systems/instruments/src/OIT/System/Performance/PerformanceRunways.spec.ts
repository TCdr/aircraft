// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { RunwaySurfaceType } from '@microsoft/msfs-sdk';
import { FacilityRunwayData, performanceRunways } from './PerformanceRunways';

/** A 4000 m runway 06L-24R, true direction 62°, rising 10 m from 06L to 24R, threshold of 24R displaced by 300 m */
const RUNWAY: FacilityRunwayData = {
  designation: '6-24',
  // The sim's designators: 1 left, 2 right
  designatorCharPrimary: 1 as FacilityRunwayData['designatorCharPrimary'],
  designatorCharSecondary: 2 as FacilityRunwayData['designatorCharSecondary'],
  direction: 62,
  length: 4000,
  primaryElevation: 100,
  secondaryElevation: 110,
  primaryThresholdLength: 0,
  secondaryThresholdLength: 300,
  surface: RunwaySurfaceType.Asphalt,
};

describe('performance runways', () => {
  it('gives both directions with their magnetic bearing, lengths, elevation and slope', () => {
    const [first, second] = performanceRunways([RUNWAY], 2);
    expect(first).toEqual({
      ident: '06L',
      magneticBearing: 60,
      takeoffLength: 4000,
      landingLength: 4000,
      elevation: expect.closeTo(328.1, 1),
      slope: expect.closeTo(0.25, 5),
    });
    expect(second).toEqual({
      ident: '24R',
      magneticBearing: 240,
      takeoffLength: 4000,
      landingLength: 3700,
      elevation: expect.closeTo(360.9, 1),
      slope: expect.closeTo(-0.25, 5),
    });
  });

  it('leaves out the water runways and the helipads', () => {
    expect(performanceRunways([{ ...RUNWAY, surface: RunwaySurfaceType.Water }], 0)).toEqual([]);
    expect(performanceRunways([{ ...RUNWAY, designation: 'H1' }], 0)).toEqual([]);
  });

  it('keeps the bearing within 0-360 with a western variation', () => {
    expect(performanceRunways([{ ...RUNWAY, direction: 358 }], -5)[0].magneticBearing).toBeCloseTo(3, 5);
  });
});
