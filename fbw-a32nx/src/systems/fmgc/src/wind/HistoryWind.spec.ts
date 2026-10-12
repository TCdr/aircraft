// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FpmConfigs } from '../flightplanning/FpmConfig';
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

  it('stores the directions from 0 to 360 deg and the cruise level to the nearest 100 ft, as recorded winds are', () => {
    // 25 kt from 270 deg: x = 0, y = -25 (atan2 gives -90 deg); develop stored the measured cruise altitude unrounded
    localStorage.setItem(
      HistoryWind.LEGACY_LOCALSTORAGE_KEYS.A32NX,
      JSON.stringify([
        { altitude: 5000, vector: legacyVec2(0, -25) },
        null,
        null,
        { altitude: 35012, vector: legacyVec2(10, -10) },
      ]),
    );

    new HistoryWind(new EventBus());

    const stored = JSON.parse(localStorage.getItem(HistoryWind.LOCALSTORAGE_KEY)!);
    expect(stored[0].vector.direction).toBeCloseTo((3 * Math.PI) / 2);
    expect(stored[3].vector.direction).toBeCloseTo((7 * Math.PI) / 4);
    expect(stored[3].altitude).toBe(35000);
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
    // The legacy winds are not needed any more
    expect(localStorage.getItem(HistoryWind.LEGACY_LOCALSTORAGE_KEYS.A32NX)).toBeNull();
  });

  it('drops a legacy value that cannot be read', () => {
    localStorage.setItem(HistoryWind.LEGACY_LOCALSTORAGE_KEYS.A32NX, '{not json');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    new HistoryWind(new EventBus());

    expect(log).toHaveBeenCalledWith(expect.stringContaining('Error converting legacy history winds'));
    log.mockRestore();

    expect(localStorage.getItem(HistoryWind.LEGACY_LOCALSTORAGE_KEYS.A32NX)).toBeNull();
    expect(localStorage.getItem(HistoryWind.LOCALSTORAGE_KEY)).toBeNull();
  });

  describe('rows by aircraft', () => {
    // The previous flight cruised at FL380; the plan now has FL350
    const storeFlightWithCruiseAtFl380 = () =>
      localStorage.setItem(
        HistoryWind.LOCALSTORAGE_KEY,
        JSON.stringify([
          { altitude: 5000, vector: { direction: 1, magnitude: 10 } },
          { altitude: 15000, vector: { direction: 1, magnitude: 20 } },
          { altitude: 25000, vector: { direction: 1, magnitude: 30 } },
          { altitude: 38000, vector: { direction: 1, magnitude: 40 } },
        ]),
      );

    it('the A380 lists the CRZ FL and FL 250, 150, 050 only, with the measured cruise wind', () => {
      storeFlightWithCruiseAtFl380();

      const winds = new HistoryWind(new EventBus(), 'A380').getRecordedWinds(350, false);

      expect(winds.map((w) => w.altitude)).toEqual([38000, 25000, 15000, 5000]);
      expect(winds[0].vector.magnitude).toBe(40);
      expect(winds.map((w) => w.isCruiseLevel)).toEqual([true, false, false, false]);
    });

    it('the A32NX keeps its list with the planned CRZ FL as well', () => {
      storeFlightWithCruiseAtFl380();

      const winds = new HistoryWind(new EventBus(), 'A320').getRecordedWinds(350, false);

      expect(winds.map((w) => w.altitude)).toEqual([38000, 35000, 25000, 15000, 5000]);
      expect(winds.every((w) => w.isCruiseLevel === undefined)).toBe(true);
    });

    it('the A380 lists a cruise at a fixed level once, with the measured cruise wind', () => {
      // The previous flight cruised at FL250: the fixed FL 250 entry and the cruise entry have the same level
      localStorage.setItem(
        HistoryWind.LOCALSTORAGE_KEY,
        JSON.stringify([
          { altitude: 5000, vector: { direction: 1, magnitude: 10 } },
          { altitude: 15000, vector: { direction: 1, magnitude: 20 } },
          { altitude: 25000, vector: { direction: 1, magnitude: 30 } },
          { altitude: 25000, vector: { direction: 1, magnitude: 99 } },
        ]),
      );

      const winds = new HistoryWind(new EventBus(), 'A380').getRecordedWinds(250, false);

      expect(winds.map((w) => w.altitude)).toEqual([25000, 15000, 5000]);
      expect(winds[0].vector.magnitude).toBe(99);
      expect(winds[0].isCruiseLevel).toBe(true);
    });

    it('is the default rule of the A32NX and a rule of the A380 configuration', () => {
      expect(FpmConfigs.A380.HISTORY_WIND_ROWS_RULE).toBe('A380');
      expect(FpmConfigs.A320_HONEYWELL_H4.HISTORY_WIND_ROWS_RULE).toBe('A320');
    });
  });

  describe('on the A380X', () => {
    it('reads the A380X legacy key into its own key and leaves the A32NX one alone', () => {
      localStorage.setItem(
        'FBW.A380X.HistoryWinds',
        JSON.stringify([{ altitude: 5000, vector: legacyVec2(0, 30) }, null, null, null]),
      );
      localStorage.setItem('FBW.HistoryWinds', '[null,null,null,null]');

      new HistoryWind(new EventBus(), 'A380', 'A380X');

      expect(localStorage.getItem('FBW.A380X.HistoryWinds')).toBeNull();
      expect(localStorage.getItem('FBW.HistoryWinds')).toBe('[null,null,null,null]');
      const stored = JSON.parse(localStorage.getItem('A380X.HistoryWinds')!);
      expect(stored[0].vector.magnitude).toBeCloseTo(30);
    });
  });
});
