// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { sunsetUtc } from './sunset';

const MS_PER_MINUTE = 60_000;

/** Distance between two instants in minutes */
const minutesApart = (a: Date | null, b: string): number =>
  Math.abs((a as Date).getTime() - new Date(b).getTime()) / MS_PER_MINUTE;

describe('sunsetUtc', () => {
  it('puts the Paris sunset on 2026-10-23 at 16:46 UTC', () => {
    // Reference from an independent bisection on the sun altitude -0.833 degrees: 16:45:58 UTC
    expect(
      minutesApart(sunsetUtc(48.8566, 2.3522, new Date('2026-10-23T12:00:00Z')), '2026-10-23T16:46:00Z'),
    ).toBeLessThan(3);
  });

  it('puts the Sydney sunset on 2026-10-23 at 08:15 UTC, in the southern hemisphere and east of the date line start', () => {
    // Reference from the same independent bisection: 08:14:53 UTC
    expect(
      minutesApart(sunsetUtc(-33.8688, 151.2093, new Date('2026-10-23T12:00:00Z')), '2026-10-23T08:15:00Z'),
    ).toBeLessThan(3);
  });

  it('returns the sunset of the local solar day for a western longitude, which falls on the next UTC day', () => {
    // Los Angeles: 17:09 local, 01:09 UTC on the 24th; independent bisection 01:09:12
    expect(
      minutesApart(sunsetUtc(34.0522, -118.2437, new Date('2026-10-23T12:00:00Z')), '2026-10-24T01:09:00Z'),
    ).toBeLessThan(3);
  });

  it('is null in polar day: latitude 80 degrees in June', () => {
    expect(sunsetUtc(80, 10, new Date('2026-06-21T12:00:00Z'))).toBeNull();
  });

  it('is null in polar night: latitude 80 degrees in December', () => {
    expect(sunsetUtc(80, 10, new Date('2026-12-21T12:00:00Z'))).toBeNull();
  });
});
