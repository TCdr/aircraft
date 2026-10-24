// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { INavlogFix } from '../../../../../shared/src/Simbrief/simbriefInterface';
import { flightLineProgress, navlogPoint, plannedTimeOver, timeOverPoint } from './flightLineMarks';

const fix = (ident: string, lat: string, long: string, timeTotal: string) =>
  ({ ident, pos_lat: lat, pos_long: long, time_total: timeTotal }) as INavlogFix;

const navlog = [
  fix('KESKA', '45.80', '-74.60', '600'),
  fix('TOC', '46.20', '-75.90', '1320'),
  fix('GGW', '48.21', '-106.63', '12000'),
  fix('TOD', '49.30', '-121.10', '18960'),
];

describe('navlogPoint', () => {
  it('reads the position and the time after takeoff of the TOC and TOD fixes', () => {
    expect(navlogPoint(navlog, 'TOC')).toEqual({ lat: 46.2, long: -75.9, secondsAfterTakeoff: 1320 });
    expect(navlogPoint(navlog, 'TOD')).toEqual({ lat: 49.3, long: -121.1, secondsAfterTakeoff: 18960 });
  });

  it('is null without a fix list (DCT route) or without the fix', () => {
    expect(navlogPoint(undefined, 'TOC')).toBeNull();
    expect(navlogPoint([fix('KESKA', '45.80', '-74.60', '600')], 'TOD')).toBeNull();
  });

  it('is null when the fix has no usable position', () => {
    expect(navlogPoint([fix('TOC', '', '-75.90', '1320')], 'TOC')).toBeNull();
  });
});

describe('flightLineProgress', () => {
  const departure = { lat: 0, long: 0 };
  const arrival = { lat: 0, long: 10 };

  it('is the share of the great-circle distance flown when over the point', () => {
    expect(flightLineProgress(departure, arrival, { lat: 0, long: 2.5 })).toBeCloseTo(25, 1);
    expect(flightLineProgress(departure, arrival, { lat: 0, long: 9 })).toBeCloseTo(90, 1);
  });

  it('stays on the line for a point behind the departure', () => {
    expect(flightLineProgress(departure, arrival, { lat: 0, long: -3 })).toBe(0);
  });

  it('is 0 when departure and arrival are the same place', () => {
    expect(flightLineProgress(departure, departure, { lat: 0, long: 1 })).toBe(0);
  });
});

describe('plannedTimeOver', () => {
  // 2026-10-23 16:35Z off block, 15 min taxi out
  const schedOut = `${Date.UTC(2026, 9, 23, 16, 35) / 1000}`;

  it('is off-block time plus taxi out plus the time after takeoff, in zulu', () => {
    expect(plannedTimeOver(schedOut, 900, { lat: 0, long: 0, secondsAfterTakeoff: 1320 })).toBe('1712Z');
  });

  it('takes the taxi out time as SimBrief sends it (a string)', () => {
    expect(plannedTimeOver(schedOut, '900', { lat: 0, long: 0, secondsAfterTakeoff: 18960 })).toBe('2206Z');
  });
});

describe('timeOverPoint', () => {
  // 2026-10-23 16:35Z off block, 15 min taxi out, T/D 22 min after takeoff
  const schedOut = `${Date.UTC(2026, 9, 23, 16, 35) / 1000}`;
  const topOfDescent = { lat: 0, long: 0, secondsAfterTakeoff: 1320 };

  it('is the planned time before takeoff', () => {
    expect(timeOverPoint(schedOut, 900, topOfDescent, null)).toBe('1712Z');
  });

  it('counts from the actual takeoff once it is latched, whatever the off-block time and taxi', () => {
    // took off 40 min late at 17:30Z
    const takeoff = Date.UTC(2026, 9, 23, 17, 30) / 1000;
    expect(timeOverPoint(schedOut, 900, topOfDescent, takeoff)).toBe('1752Z');
  });
});
