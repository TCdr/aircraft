// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildStationWx, msUntilRefresh, selectTripAirports, trueRunwayHeading, withTimeout } from './tripWeather';

const ofp = {
  origin: 'LFPG',
  originRunway: '27R',
  destination: 'EGLL',
  destinationRunway: '09L',
  alternate: 'EGKK',
};

describe('selectTripAirports', () => {
  it('uses the three airports of the OFP, with the runways of the OFP for departure and destination', () => {
    expect(selectTripAirports({ ofp, userDeparture: 'KJFK', userDestination: 'KBOS' })).toEqual([
      { role: 'dep', icao: 'LFPG', runway: '27R' },
      { role: 'dest', icao: 'EGLL', runway: '09L' },
      { role: 'altn', icao: 'EGKK', runway: null },
    ]);
  });

  it('uses the typed airports without an OFP, with no runway and no alternate', () => {
    expect(selectTripAirports({ ofp: null, userDeparture: ' lfpg ', userDestination: 'egll' })).toEqual([
      { role: 'dep', icao: 'LFPG', runway: null },
      { role: 'dest', icao: 'EGLL', runway: null },
    ]);
  });

  it('skips an airport that is empty or not a four character code', () => {
    expect(selectTripAirports({ ofp: null, userDeparture: 'LF', userDestination: undefined })).toEqual([]);
    expect(selectTripAirports({ ofp: { ...ofp, alternate: '' }, userDeparture: '', userDestination: '' })).toHaveLength(
      2,
    );
  });

  it('falls back to the typed airports when the OFP has no origin and destination', () => {
    expect(
      selectTripAirports({
        ofp: { ...ofp, origin: '', destination: '' },
        userDeparture: 'KJFK',
        userDestination: 'KBOS',
      }),
    ).toEqual([
      { role: 'dep', icao: 'KJFK', runway: null },
      { role: 'dest', icao: 'KBOS', runway: null },
    ]);
  });
});

describe('trueRunwayHeading', () => {
  const runways = [
    { ident: '09L', bearing: 91.4 },
    { ident: '27R', bearing: 271.4 },
  ];

  it('returns the true bearing of the runway of the OFP', () => {
    expect(trueRunwayHeading('27R', runways)).toBe(271.4);
  });

  it('matches a designator without the leading zero', () => {
    expect(trueRunwayHeading('9L', runways)).toBe(91.4);
  });

  it('is null for no runway, an unknown runway or no facility data', () => {
    expect(trueRunwayHeading(null, runways)).toBeNull();
    expect(trueRunwayHeading('', runways)).toBeNull();
    expect(trueRunwayHeading('18', runways)).toBeNull();
    expect(trueRunwayHeading('27R', null)).toBeNull();
  });
});

describe('buildStationWx', () => {
  it('keeps the reports it got and marks the departure', () => {
    expect(buildStationWx({ role: 'dep', icao: 'LFPG', runway: '27R' }, 'METAR LFPG', 'TAF LFPG', 271.4)).toEqual({
      icao: 'LFPG',
      metar: 'METAR LFPG',
      taf: 'TAF LFPG',
      runwayHeadingDeg: 271.4,
      isDeparture: true,
    });
  });

  it('leaves a failed or empty report undefined', () => {
    const station = buildStationWx({ role: 'altn', icao: 'EGKK', runway: null }, '', null, null);
    expect(station.metar).toBeUndefined();
    expect(station.taf).toBeUndefined();
    expect(station.runwayHeadingDeg).toBeNull();
    expect(station.isDeparture).toBe(false);
  });
});

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the value of a lookup that answers in time', async () => {
    expect(await withTimeout(Promise.resolve(42), 1000).result).toBe(42);
  });

  it('resolves undefined for a lookup that rejects', async () => {
    expect(await withTimeout(Promise.reject(new Error('x')), 1000).result).toBeUndefined();
  });

  it('resolves undefined when the lookup never answers', async () => {
    vi.useFakeTimers();
    const timed = withTimeout(new Promise<number>(() => undefined), 1000);
    vi.advanceTimersByTime(1000);
    expect(await timed.result).toBeUndefined();
  });

  it('leaves no timer running after an answer or a cancel', async () => {
    vi.useFakeTimers();
    await withTimeout(Promise.resolve(1), 1000).result;
    const pending = withTimeout(new Promise<number>(() => undefined), 1000);
    pending.cancel();
    expect(await pending.result).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('msUntilRefresh', () => {
  const refreshMs = 600_000;

  it('is due now when an airport was never fetched', () => {
    expect(msUntilRefresh([1_000, undefined], 2_000, refreshMs)).toBe(0);
  });

  it('waits for the rest of the period of the oldest report on a return within it', () => {
    expect(msUntilRefresh([100_000, 400_000], 500_000, refreshMs)).toBe(200_000);
  });

  it('is due now once the oldest report is older than the period', () => {
    expect(msUntilRefresh([100_000, 400_000], 800_000, refreshMs)).toBe(0);
  });

  it('is due now with no airport', () => {
    expect(msUntilRefresh([], 0, refreshMs)).toBe(0);
  });
});
