// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  formatAge,
  formatLocal,
  formatZulu,
  hourStarts,
  isAtAirport,
  nextSunsetMs,
  reportAgeMinutes,
  reportTimeMs,
} from './stationTime';
import { RJOA_METAR_VFR, RJOA_TAF } from './rjoaFixtures';

const NOW_MS = Date.UTC(2026, 9, 24, 18, 17);

describe('report times', () => {
  it('puts the METAR and TAF time groups on the day nearest to now', () => {
    expect(reportTimeMs(RJOA_METAR_VFR, NOW_MS)).toBe(Date.UTC(2026, 9, 24, 18, 0));
    expect(reportTimeMs(RJOA_TAF, NOW_MS)).toBe(Date.UTC(2026, 9, 24, 17, 5));
    // A report of the 30th seen on the 1st belongs to the month before
    expect(reportTimeMs('METAR XXXX 302350Z 00000KT', Date.UTC(2026, 10, 1, 0, 10))).toBe(
      Date.UTC(2026, 9, 30, 23, 50),
    );
    expect(reportTimeMs('NIL', NOW_MS)).toBeNull();
  });

  it('gives the age in whole minutes, never negative', () => {
    expect(reportAgeMinutes(Date.UTC(2026, 9, 24, 18, 0), NOW_MS)).toBe(17);
    expect(reportAgeMinutes(NOW_MS + 60_000, NOW_MS)).toBe(0);
    expect(formatAge(17)).toBe('17m');
    expect(formatAge(73)).toBe('1h 13m');
  });

  it('formats UTC and local clocks', () => {
    expect(formatZulu(Date.UTC(2026, 9, 24, 18, 0))).toBe('1800Z');
    expect(formatLocal(Date.UTC(2026, 9, 24, 18, 0), 9 * 3600)).toBe('03:00');
    expect(formatLocal(Date.UTC(2026, 9, 24, 3, 0), -5 * 3600)).toBe('22:00');
  });
});

describe('isAtAirport', () => {
  it('is true within 5 nm of the airport reference point only', () => {
    // RJOA reference point and a gate about 0.6 nm from it
    expect(isAtAirport(34.4428, 132.9183, 34.4361, 132.9194)).toBe(true);
    // Hiroshima city, about 25 nm away
    expect(isAtAirport(34.3853, 132.4553, 34.4361, 132.9194)).toBe(false);
  });
});

describe('nextSunsetMs', () => {
  it('gives the next sunset after now: RJOA on 24 October sets about 08:24 UTC (17:24 local)', () => {
    const before = nextSunsetMs(34.4361, 132.9194, Date.UTC(2026, 9, 24, 3, 0));
    expect(Math.abs((before as number) - Date.UTC(2026, 9, 24, 8, 24)) / 60_000).toBeLessThan(4);
    // After that sunset the next one is the following day's
    const after = nextSunsetMs(34.4361, 132.9194, Date.UTC(2026, 9, 24, 18, 0));
    expect(Math.abs((after as number) - Date.UTC(2026, 9, 25, 8, 23)) / 60_000).toBeLessThan(4);
  });

  it('is null in polar night', () => {
    expect(nextSunsetMs(78.2, 15.6, Date.UTC(2026, 11, 21, 12))).toBeNull();
  });
});

describe('hourStarts', () => {
  it('lists every whole hour from the start up to the end', () => {
    expect(hourStarts(Date.UTC(2026, 9, 24, 18), Date.UTC(2026, 9, 24, 21))).toEqual([
      Date.UTC(2026, 9, 24, 18),
      Date.UTC(2026, 9, 24, 19),
      Date.UTC(2026, 9, 24, 20),
    ]);
  });
});
