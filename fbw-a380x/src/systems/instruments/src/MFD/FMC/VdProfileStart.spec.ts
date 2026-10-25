// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { startProfileAtAircraftOnGround } from './VdProfileStart';

// A take-off 0.9 NM behind the aircraft, then the thrust reduction altitude and the climb
const BEHIND_AIRCRAFT = [
  { distanceFromAircraft: -0.9, altitude: 117 },
  { distanceFromAircraft: 0.1, altitude: 1620 },
  { distanceFromAircraft: 4.2, altitude: 4374 },
];

describe('VD profile start on the ground', () => {
  it('moves the profile back so that the take-off point sits at the aircraft', () => {
    const shifted = startProfileAtAircraftOnGround(BEHIND_AIRCRAFT, true);

    expect(shifted.map((point) => point.altitude)).toEqual([117, 1620, 4374]);
    expect(shifted[0].distanceFromAircraft).toBe(0);
    expect(shifted[1].distanceFromAircraft).toBeCloseTo(1.0);
    expect(shifted[2].distanceFromAircraft).toBeCloseTo(5.1);
  });

  it('keeps the distances between the points', () => {
    const shifted = startProfileAtAircraftOnGround(BEHIND_AIRCRAFT, true);

    for (let i = 1; i < shifted.length; i++) {
      expect(shifted[i].distanceFromAircraft - shifted[i - 1].distanceFromAircraft).toBeCloseTo(
        BEHIND_AIRCRAFT[i].distanceFromAircraft - BEHIND_AIRCRAFT[i - 1].distanceFromAircraft,
      );
    }
  });

  it('leaves the profile alone in the air or when it starts at or ahead of the aircraft', () => {
    expect(startProfileAtAircraftOnGround(BEHIND_AIRCRAFT, false)).toBe(BEHIND_AIRCRAFT);
    const ahead = [{ distanceFromAircraft: 0, altitude: 117 }];
    expect(startProfileAtAircraftOnGround(ahead, true)).toBe(ahead);
    expect(startProfileAtAircraftOnGround([], true)).toEqual([]);
  });
});
