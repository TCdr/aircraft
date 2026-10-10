// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryWind } from './HistoryWind';

// Develop stored the winds as Vec2 [x, y] with x = speed * cos(direction), y = speed * sin(direction);
// a Float64Array serialises as an object with the keys "0" and "1", not as an array.
const legacyVec2 = (x: number, y: number) => ({ 0: x, 1: y });

describe('history winds storage', () => {
  beforeEach(() => localStorage.clear());

  it('keeps one legacy key for each aircraft', () => {
    expect(HistoryWind.LEGACY_LOCALSTORAGE_KEYS).toEqual({
      A32NX: 'FBW.HistoryWinds',
      A380X: 'FBW.A380X.HistoryWinds',
    });
  });

  it('reads the winds stored under the previous key once, then uses the new key', () => {
    // The test environment is the A32NX (AIRCRAFT_PROJECT_PREFIX in vitest.config.mjs)
    const legacy = HistoryWind.LEGACY_LOCALSTORAGE_KEYS.A32NX;
    // 30 kt wind, true direction 90 deg: x = 0, y = 30
    localStorage.setItem(
      legacy,
      JSON.stringify([
        { altitude: 5000, vector: legacyVec2(0, 30) },
        null,
        { altitude: 25000, vector: legacyVec2(-20, 0) },
        { altitude: 36000, vector: legacyVec2(10, 10) },
      ]),
    );

    const history = new HistoryWind(new EventBus());

    expect(localStorage.getItem(legacy)).toBeNull();
    const stored = JSON.parse(localStorage.getItem(HistoryWind.LOCALSTORAGE_KEY)!);
    expect(stored[0].altitude).toBe(5000);
    expect(stored[0].vector.magnitude).toBeCloseTo(30);
    expect(stored[0].vector.direction).toBeCloseTo(Math.PI / 2);
    expect(stored[1]).toBeNull();
    expect(stored[2].vector.magnitude).toBeCloseTo(20);
    expect(stored[2].vector.direction).toBeCloseTo(Math.PI);
    expect(stored[3].altitude).toBe(36000);
    expect(stored[3].vector.magnitude).toBeCloseTo(Math.hypot(10, 10));
    expect(stored[3].vector.direction).toBeCloseTo(Math.PI / 4);

    const winds = history.getRecordedWinds(null);
    expect(winds.map((w) => w.altitude)).toEqual([5000, 15000, 25000, 36000]);
    expect(winds[0].vector.magnitude).toBeCloseTo(30);
  });

  it('accepts a Vec2 stored as a plain array', () => {
    localStorage.setItem(
      HistoryWind.LEGACY_LOCALSTORAGE_KEYS.A32NX,
      JSON.stringify([{ altitude: 5000, vector: [30, 0] }, null, null, null]),
    );

    new HistoryWind(new EventBus());

    const stored = JSON.parse(localStorage.getItem(HistoryWind.LOCALSTORAGE_KEY)!);
    expect(stored[0].vector.magnitude).toBeCloseTo(30);
    expect(stored[0].vector.direction).toBeCloseTo(0);
  });

  it('does not touch the winds stored under the new key', () => {
    const current = [null, null, { altitude: 25000, vector: { direction: 1, magnitude: 40 } }, null];
    localStorage.setItem(HistoryWind.LOCALSTORAGE_KEY, JSON.stringify(current));
    localStorage.setItem(
      HistoryWind.LEGACY_LOCALSTORAGE_KEYS.A32NX,
      JSON.stringify([{ altitude: 5000, vector: legacyVec2(0, 30) }, null, null, null]),
    );

    new HistoryWind(new EventBus());

    expect(JSON.parse(localStorage.getItem(HistoryWind.LOCALSTORAGE_KEY)!)).toEqual(current);
  });

  it('drops a legacy value that cannot be read', () => {
    localStorage.setItem(HistoryWind.LEGACY_LOCALSTORAGE_KEYS.A32NX, '{not json');

    new HistoryWind(new EventBus());

    expect(localStorage.getItem(HistoryWind.LEGACY_LOCALSTORAGE_KEYS.A32NX)).toBeNull();
    expect(localStorage.getItem(HistoryWind.LOCALSTORAGE_KEY)).toBeNull();
  });

  describe('on the A380X', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it('reads the A380X legacy key and leaves the A32NX one alone', async () => {
      vi.stubEnv('AIRCRAFT_PROJECT_PREFIX', 'a380x');
      vi.resetModules();
      const { HistoryWind: A380History } = await import('./HistoryWind');
      localStorage.setItem(
        'FBW.A380X.HistoryWinds',
        JSON.stringify([{ altitude: 5000, vector: legacyVec2(0, 30) }, null, null, null]),
      );
      localStorage.setItem('FBW.HistoryWinds', '[null,null,null,null]');

      new A380History(new EventBus());

      expect(A380History.LOCALSTORAGE_KEY).toBe('A380X.HistoryWinds');
      expect(localStorage.getItem('FBW.A380X.HistoryWinds')).toBeNull();
      expect(localStorage.getItem('FBW.HistoryWinds')).toBe('[null,null,null,null]');
      const stored = JSON.parse(localStorage.getItem('A380X.HistoryWinds')!);
      expect(stored[0].vector.magnitude).toBeCloseTo(30);
      // Loading the module again transforms the whole FMS code, which is slow
    }, 60_000);
  });
});
