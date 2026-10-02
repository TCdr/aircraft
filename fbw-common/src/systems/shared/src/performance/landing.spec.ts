// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { landingIsaTemperature, landingPressureAltitude, landingWindIncrement } from './landing';

describe('landingWindIncrement', () => {
  // A320 FCOM DSC-22_20-50 (PERF APPR VAPP) and A380 FCOM PER-LND: 1/3 of the tower headwind, at least 5 kt with the
  // A/THR, at most 15 kt; no wind or a tailwind counts as 0
  it('is 1/3 of the headwind', () => {
    expect(landingWindIncrement(18)).toBe(6);
    expect(landingWindIncrement(30)).toBe(10);
    expect(landingWindIncrement(39)).toBe(13);
  });

  it('is at least 5 kt, also with no wind or a tailwind', () => {
    expect(landingWindIncrement(0)).toBe(5);
    expect(landingWindIncrement(9)).toBe(5);
    expect(landingWindIncrement(-10)).toBe(5);
  });

  it('is at most 15 kt', () => {
    expect(landingWindIncrement(45)).toBe(15);
    expect(landingWindIncrement(60)).toBe(15);
  });

  it('rounds to the nearest knot (design choice: the FCOM gives no rounding)', () => {
    expect(landingWindIncrement(22)).toBe(7);
    expect(landingWindIncrement(23)).toBe(8);
  });
});

describe('landingPressureAltitude', () => {
  it('is the elevation with the standard QNH', () => {
    expect(landingPressureAltitude(2000, 1013.25)).toBeCloseTo(2000, 6);
  });

  it('rises by about 27 ft per hPa below the standard QNH', () => {
    // 30 hPa below standard at sea level: 829 ft in the ICAO standard atmosphere
    expect(Math.abs(landingPressureAltitude(0, 983.25) - 829)).toBeLessThan(1);
    expect(landingPressureAltitude(0, 1043.25)).toBeLessThan(-780);
  });
});

describe('landingIsaTemperature', () => {
  it('is 15 °C at sea level, 1.98 °C less per 1000 ft', () => {
    expect(landingIsaTemperature(0)).toBe(15);
    expect(landingIsaTemperature(10_000)).toBeCloseTo(15 - 19.812, 6);
  });
});
