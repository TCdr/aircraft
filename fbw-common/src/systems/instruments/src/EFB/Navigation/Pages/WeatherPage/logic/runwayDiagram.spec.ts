// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Runway } from '../../../../Performance/Data/Runways';
import { componentScaleKt, favouredRunwayEnd, fieldElevationFt } from './runwayDiagram';

const runway = (ident: string, bearing: number, elevation = 33): Runway => ({
  airportIdent: 'RJOA',
  ident,
  bearing,
  magneticBearing: bearing,
  gradient: 0,
  length: 3000,
  elevation,
});

const RJOA = [runway('10', 97, 1060), runway('28', 277, 1088)];

describe('favouredRunwayEnd', () => {
  it('takes the end facing most into the wind', () => {
    expect(favouredRunwayEnd(RJOA, 70)?.ident).toBe('10');
    expect(favouredRunwayEnd(RJOA, 320)?.ident).toBe('28');
  });

  it('takes the first end for a variable wind and none without runways', () => {
    expect(favouredRunwayEnd(RJOA, null)?.ident).toBe('10');
    expect(favouredRunwayEnd([], 70)).toBeNull();
  });
});

describe('componentScaleKt', () => {
  it('is 20 kt for a light wind and grows in 10 kt steps with the gust', () => {
    expect(componentScaleKt(6, null)).toBe(20);
    expect(componentScaleKt(18, 28)).toBe(40);
    expect(componentScaleKt(30, null)).toBe(40);
  });
});

describe('fieldElevationFt', () => {
  it('is the highest runway end', () => {
    expect(fieldElevationFt(RJOA)).toBe(1088);
    expect(fieldElevationFt([])).toBeNull();
  });
});
