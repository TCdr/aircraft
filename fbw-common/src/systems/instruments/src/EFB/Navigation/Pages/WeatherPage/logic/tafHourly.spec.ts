// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { tafHours, tafLines } from './tafHourly';
import { RJOA_TAF } from './rjoaFixtures';

const REFERENCE_MS = Date.UTC(2026, 9, 24, 18, 20);

describe('tafHours, RJOA 241705Z', () => {
  const hours = tafHours(RJOA_TAF, REFERENCE_MS);
  const byHour = (day: number, hour: number) => {
    const found = hours.find((entry) => entry.startMs === Date.UTC(2026, 9, day, hour));
    if (!found) {
      throw new Error(`no column for ${day} ${hour}Z`);
    }
    return found;
  };

  it('has one column per hour of the validity, 24 18Z to 26 00Z', () => {
    expect(hours.length).toBe(30);
    expect(hours[0].startMs).toBe(Date.UTC(2026, 9, 24, 18));
    expect(hours[29].startMs).toBe(Date.UTC(2026, 9, 25, 23));
  });

  it('gives the TEMPO ranges of visibility and ceiling', () => {
    expect(byHour(24, 21).visibility).toEqual({
      min: { metres: 500, orMore: false },
      max: { metres: 6000, orMore: false },
    });
    expect(byHour(24, 21).ceilingFt).toEqual({ min: 300, max: 1200 });
    expect(byHour(24, 18).ceilingFt).toEqual({ min: 1200, max: 1200 });
  });

  it('a wind-only BECMG keeps the base visibility', () => {
    expect(byHour(25, 13).visibility?.min.metres).toBe(6000);
  });
});

describe('tafHours, FM and PROB', () => {
  const taf =
    'TAF KJFK 241720Z 2418/2524 31012KT P6SM SCT050 ' +
    'FM250200 28015G25KT P6SM BKN030 ' +
    'PROB30 2506/2509 2SM -RA BR OVC008 ' +
    'TEMPO 2510/2512 31020G35KT';
  const hours = tafHours(taf, Date.UTC(2026, 9, 24, 18));
  const at = (day: number, hour: number) => hours.find((entry) => entry.startMs === Date.UTC(2026, 9, day, hour));

  it('an FM group replaces everything from its time on', () => {
    expect(at(25, 1)?.ceilingFt).toEqual({ min: null, max: null });
    expect(at(25, 2)?.ceilingFt).toEqual({ min: 3000, max: 3000 });
  });

  it('a PROB group lowers the visibility and ceiling of its hours', () => {
    expect(at(25, 6)?.visibility?.min.metres).toBe(3218);
    expect(at(25, 6)?.ceilingFt).toEqual({ min: 800, max: 3000 });
  });

  it('gives no hours for a TAF without a validity period', () => {
    expect(tafHours('TAF XXXX NIL', Date.UTC(2026, 9, 24))).toEqual([]);
  });
});

describe('tafLines', () => {
  it('starts a line at every change group, PROB30 TEMPO staying together', () => {
    expect(
      tafLines(
        'TAF XXXX 241720Z 2418/2524 31012KT 9999 FM250200 28015KT 9999 PROB30 TEMPO 2506/2509 4000 BECMG 2510/2512 NSW',
      ),
    ).toEqual([
      'TAF XXXX 241720Z 2418/2524 31012KT 9999',
      'FM250200 28015KT 9999',
      'PROB30 TEMPO 2506/2509 4000',
      'BECMG 2510/2512 NSW',
    ]);
  });
});
