// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { secondsAheadOfUtc, timeMarkerDistancesFromStart, timeMarkerIdent } from './TimeMarkerPseudoWaypoints';

describe('time marker pseudo waypoint', () => {
  it('is named by its time, with seconds only when it has some', () => {
    expect(timeMarkerIdent(10 * 3600 + 45 * 60)).toBe('(1045)');
    expect(timeMarkerIdent(5 * 3600 + 7)).toBe('(050007)');
  });

  it('is ahead of the reference, on the next day when earlier in the day', () => {
    expect(secondsAheadOfUtc(3700, 3600)).toBe(100);
    expect(secondsAheadOfUtc(3500, 3600)).toBe(86_300);
  });

  const profile = {
    checkpoints: [{ secondsFromPresent: 0 }, { secondsFromPresent: 600 }, { secondsFromPresent: 1200 }],
    interpolateDistanceAtTime: (seconds: number) => seconds / 6,
  };

  it('is placed by the predicted time inside the flight only', () => {
    const markers = [100, 600, 1500, -5, 0].map((secondsFromPresent) => ({ utcSeconds: 0, secondsFromPresent }));

    const placed = timeMarkerDistancesFromStart(markers, profile);

    expect(placed.map((it) => it.marker.secondsFromPresent)).toEqual([100, 600]);
    expect(placed.map((it) => it.distanceFromStart)).toEqual([100 / 6, 100]);
  });

  it('is not placed without a profile', () => {
    expect(
      timeMarkerDistancesFromStart([{ utcSeconds: 0, secondsFromPresent: 5 }], { ...profile, checkpoints: [] }),
    ).toEqual([]);
  });

  // 4h18 route of 2061 NM as on the ground at the gate: climb, cruise, descent, times counted from departure
  const longRoute = {
    checkpoints: [
      { secondsFromPresent: 0, distanceFromStart: 0 },
      { secondsFromPresent: 1500, distanceFromStart: 180 },
      { secondsFromPresent: 13_500, distanceFromStart: 1800 },
      { secondsFromPresent: 15_480, distanceFromStart: 2061 },
    ],
    interpolateDistanceAtTime(seconds: number) {
      const points = this.checkpoints;
      const next = points.findIndex((point) => point.secondsFromPresent >= seconds);
      const [from, to] = [points[next - 1], points[next]];
      return (
        from.distanceFromStart +
        ((seconds - from.secondsFromPresent) / (to.secondsFromPresent - from.secondsFromPresent)) *
          (to.distanceFromStart - from.distanceFromStart)
      );
    },
  };

  it('is placed far down a long profile without a time or distance horizon', () => {
    const placed = timeMarkerDistancesFromStart([{ utcSeconds: 0, secondsFromPresent: 9000 }], longRoute);

    expect(placed).toHaveLength(1);
    expect(placed[0].distanceFromStart).toBeCloseTo(180 + (7500 / 12_000) * 1620, 6);
  });
});
