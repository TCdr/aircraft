// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { estimateTakeoffRunDistances } from './takeoff';

// 2300 m of required runway: 2000 m to the screen height (the required length is 115 % of it)
const REQUIRED = 2300;

describe('estimateTakeoffRunDistances', () => {
  it('puts the screen height at the required length divided by 1.15', () => {
    expect(estimateTakeoffRunDistances(REQUIRED, 120, 130, 140, 0, 15, 0).screenHeight).toBeCloseTo(2000, 6);
  });

  it('scales the distances with the square of the ground speed, V2 + 10 kt at the screen height', () => {
    // sea level, ISA, no wind: 2000 m x (120 / 150)², 2000 m x (130 / 150)²
    const distances = estimateTakeoffRunDistances(REQUIRED, 120, 130, 140, 0, 15, 0);

    expect(distances.v1!).toBeCloseTo(1280, 3);
    expect(distances.vr!).toBeCloseTo(1502.222, 3);
  });

  it('takes the headwind and the tailwind off the ground speed', () => {
    // ground speeds 100 and 130 kt with 20 kt of headwind, 130 and 160 kt with 10 kt of tailwind
    expect(estimateTakeoffRunDistances(REQUIRED, 120, 130, 140, 0, 15, 20).v1!).toBeCloseTo(1183.432, 3);
    expect(estimateTakeoffRunDistances(REQUIRED, 120, 130, 140, 0, 15, -10).v1!).toBeCloseTo(1320.313, 3);
  });

  it('turns the speeds into true airspeeds with the air density', () => {
    // 5000 ft, ISA (5.1 °C): pressure ratio 0.83205, density ratio 0.86165; the wind does not scale with it
    const distances = estimateTakeoffRunDistances(REQUIRED, 120, 130, 140, 5000, 5.1, 20);

    expect(distances.v1!).toBeCloseTo(1191.197, 3);
    expect(distances.vr!).toBeCloseTo(1437.643, 3);
  });

  it('gives no V1 or VR distance without the speed', () => {
    const distances = estimateTakeoffRunDistances(REQUIRED, undefined, undefined, 140, 0, 15, 0);

    expect(distances.v1).toBeUndefined();
    expect(distances.vr).toBeUndefined();
    expect(distances.screenHeight).toBeCloseTo(2000, 6);
  });

  it('keeps a ground speed of at least 1 kt with a headwind above the speeds', () => {
    // both ground speeds are 1 kt: the distances are the screen height distance, not negative or infinite
    expect(estimateTakeoffRunDistances(REQUIRED, 120, 130, 140, 0, 15, 200).v1!).toBeCloseTo(2000, 6);
  });
});
