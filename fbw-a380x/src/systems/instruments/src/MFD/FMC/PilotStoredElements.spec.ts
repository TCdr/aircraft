// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PilotNavaidClass,
  PilotStoredElements,
  PilotStoredNavaid,
  PilotStoredRunway,
  StoredRoute,
  hasElevation,
  hasStationDeclination,
  isLandingSystemClass,
  maxPilotStoredNavaids,
  maxPilotStoredRoutes,
  maxPilotStoredRunways,
} from './PilotStoredElements';
import { PilotStoredElementsPersistence } from './PilotStoredElementsPersistence';

/** The sim persistent storage (GetStoredData / SetStoredData), kept from one sim session to the next */
const simStorage = new Map<string, string>();

/** The NXDataStore update listeners (Coherent FBW_NXDATASTORE_UPDATE) */
let dataStoreListeners: ((key: string, value: string) => void)[] = [];

/** The flypad setting, as NXDataStore stores it with the test aircraft prefix */
const SETTING_STORAGE_KEY = `${process.env.AIRCRAFT_PROJECT_PREFIX!.toUpperCase()}_KEEP_PILOT_STORED_ELEMENTS`;
const KEPT_COPY_KEY = 'A380X_PILOT_STORED_ELEMENTS';

const navaid = (ident: string): PilotStoredNavaid => ({
  ident,
  class: PilotNavaidClass.VorDme,
  location: { lat: 48, long: 2 },
  frequency: 115.1,
});

const runway = (airportIdent: string, ident: string, length = 3000): PilotStoredRunway => ({
  airportIdent,
  ident,
  location: { lat: 48, long: 2 },
  elevation: 300,
  length,
  course: 150,
});

const route = (ident: string, originIcao = 'LFPG', destinationIcao = 'EGLL'): StoredRoute => ({
  ident,
  originIcao,
  destinationIcao,
  navlog: [],
  procedures: {},
});

const setSetting = (value: 'ENABLED' | 'DISABLED') => {
  simStorage.set(SETTING_STORAGE_KEY, value);
  dataStoreListeners.forEach((listener) => listener('KEEP_PILOT_STORED_ELEMENTS', value));
};

/** A new sim session: the browser storage is empty, the sim persistent storage is kept */
const newSession = () => {
  PilotStoredElementsPersistence.start().stop();
  localStorage.clear();
};

beforeEach(() => {
  vi.useFakeTimers();
  simStorage.clear();
  localStorage.clear();
  dataStoreListeners = [];
  vi.stubGlobal('GetStoredData', (key: string) => simStorage.get(key) ?? null);
  vi.stubGlobal('SetStoredData', (key: string, value: string) => simStorage.set(key, value));
  vi.stubGlobal('Coherent', {
    ...Coherent,
    on: (_event: string, callback: (key: string, value: string) => void) => {
      dataStoreListeners.push(callback);
      return { clear: () => (dataStoreListeners = dataStoreListeners.filter((l) => l !== callback)) };
    },
  });
});

afterEach(() => {
  PilotStoredElementsPersistence.start().stop();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('PilotStoredElements (A380 FCOM DSC-22-FMS-20-30, DATA pages)', () => {
  describe('NAVAIDs', () => {
    it('keeps 20 NAVAIDs and deletes the first created one when full', () => {
      const elements = new PilotStoredElements();
      for (let i = 0; i <= maxPilotStoredNavaids; i++) {
        elements.storeNavaid(navaid(`N${i}`));
      }
      const idents = elements.navaids.get().map((n) => n.ident);
      expect(maxPilotStoredNavaids).toBe(20);
      expect(idents).toHaveLength(20);
      expect(idents[0]).toBe('N1');
      expect(idents[19]).toBe('N20');
    });

    it('replaces a NAVAID with the same ident instead of storing it twice', () => {
      const elements = new PilotStoredElements();
      elements.storeNavaid(navaid('ABC'));
      elements.storeNavaid(navaid('DEF'));
      elements.storeNavaid({ ...navaid('ABC'), frequency: 112.5 });
      expect(elements.navaids.get().map((n) => n.ident)).toEqual(['DEF', 'ABC']);
      expect(elements.findNavaid('ABC')?.frequency).toBe(112.5);
      expect(elements.findNavaid('XYZ')).toBeUndefined();
    });

    it('deletes one NAVAID or all of them', () => {
      const elements = new PilotStoredElements();
      ['A', 'B', 'C'].forEach((ident) => elements.storeNavaid(navaid(ident)));
      elements.deleteNavaid(1);
      expect(elements.navaids.get().map((n) => n.ident)).toEqual(['A', 'C']);
      elements.deleteAllNavaids();
      expect(elements.navaids.get()).toEqual([]);
    });

    it('displays the NAVAID fields of each class', () => {
      expect(isLandingSystemClass(PilotNavaidClass.Ils)).toBe(true);
      expect(isLandingSystemClass(PilotNavaidClass.Gls)).toBe(true);
      expect(isLandingSystemClass(PilotNavaidClass.Loc)).toBe(true);
      expect(isLandingSystemClass(PilotNavaidClass.VorDme)).toBe(false);
      // ELEVATION not for VOR and NDB, STATION DEC only for VOR and VOR/DME
      expect(hasElevation(PilotNavaidClass.Vor)).toBe(false);
      expect(hasElevation(PilotNavaidClass.Ndb)).toBe(false);
      expect(hasElevation(PilotNavaidClass.Dme)).toBe(true);
      expect(hasStationDeclination(PilotNavaidClass.Vor)).toBe(true);
      expect(hasStationDeclination(PilotNavaidClass.VorDme)).toBe(true);
      expect(hasStationDeclination(PilotNavaidClass.Dme)).toBe(false);
    });
  });

  describe('runways', () => {
    it('keeps 10 runways and deletes the first created one when full (P 60)', () => {
      const elements = new PilotStoredElements();
      for (let i = 0; i <= maxPilotStoredRunways; i++) {
        elements.storeRunway(runway(`AP${i}`, '09'));
      }
      const airports = elements.runways.get().map((r) => r.airportIdent);
      expect(maxPilotStoredRunways).toBe(10);
      expect(airports).toHaveLength(10);
      expect(airports[0]).toBe('AP1');
    });

    it('replaces a runway with the same airport and ident, and keeps the same ident at another airport', () => {
      const elements = new PilotStoredElements();
      elements.storeRunway(runway('LFPG', '09L'));
      elements.storeRunway(runway('LFPO', '09L'));
      elements.storeRunway(runway('LFPG', '09L', 4200));
      const runways = elements.runways.get();
      expect(runways.map((r) => `${r.airportIdent}${r.ident}`)).toEqual(['LFPO09L', 'LFPG09L']);
      expect(runways[1].length).toBe(4200);
    });

    it('deletes one runway or all of them', () => {
      const elements = new PilotStoredElements();
      elements.storeRunway(runway('LFPG', '09L'));
      elements.storeRunway(runway('LFPG', '27R'));
      elements.deleteRunway(elements.runways.get()[0]);
      expect(elements.runways.get().map((r) => r.ident)).toEqual(['27R']);
      elements.deleteAllRunways();
      expect(elements.runways.get()).toEqual([]);
    });
  });

  describe('routes', () => {
    it('keeps 5 routes and refuses a sixth one (PILOT RTEs LIST FULL)', () => {
      const elements = new PilotStoredElements();
      expect(maxPilotStoredRoutes).toBe(5);
      for (let i = 0; i < maxPilotStoredRoutes; i++) {
        expect(elements.storeRoute(route(`RTE${i}`))).toBe(true);
      }
      expect(elements.storeRoute(route('RTE5'))).toBe(false);
      expect(elements.routes.get().map((r) => r.ident)).toEqual(['RTE0', 'RTE1', 'RTE2', 'RTE3', 'RTE4']);
    });

    it('gives the routes of a city pair for the ROUTE SELECTION page', () => {
      const elements = new PilotStoredElements();
      elements.storeRoute(route('A', 'LFPG', 'EGLL'));
      elements.storeRoute(route('B', 'LFPG', 'KJFK'));
      elements.storeRoute(route('C', 'LFPG', 'EGLL'));
      elements.storeRoute(route('D', 'EGLL', 'LFPG'));
      expect(elements.routesForCityPair('LFPG', 'EGLL').map((r) => r.ident)).toEqual(['A', 'C']);
      expect(elements.findRoute('B')?.destinationIcao).toBe('KJFK');
      elements.deleteRoute(0);
      expect(elements.findRoute('A')).toBeUndefined();
      elements.deleteAllRoutes();
      expect(elements.routes.get()).toEqual([]);
    });
  });

  describe('storage', () => {
    it('keeps the elements for the sim session', () => {
      const elements = new PilotStoredElements();
      elements.storeNavaid(navaid('ABC'));
      elements.storeRunway(runway('LFPG', '09L'));
      elements.storeRoute(route('RTE'));

      const sameSession = new PilotStoredElements();
      expect(sameSession.navaids.get().map((n) => n.ident)).toEqual(['ABC']);
      expect(sameSession.runways.get().map((r) => r.ident)).toEqual(['09L']);
      expect(sameSession.routes.get().map((r) => r.ident)).toEqual(['RTE']);
    });

    it('starts empty from an unreadable or a non-list storage', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem('A380X.PilotStoredNavaids', '{not json');
      localStorage.setItem('A380X.PilotStoredRoutes', '{"ident": "RTE"}');
      const elements = new PilotStoredElements();
      expect(elements.navaids.get()).toEqual([]);
      expect(elements.routes.get()).toEqual([]);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});

describe('PilotStoredElementsPersistence (flypad KEEP PILOT STORED ELEMENTS)', () => {
  it('deletes the elements at the end of the session without the setting (FCOM)', () => {
    new PilotStoredElements().storeNavaid(navaid('ABC'));
    vi.advanceTimersByTime(10_000);
    expect(simStorage.has(KEPT_COPY_KEY)).toBe(false);

    newSession();
    expect(new PilotStoredElements().navaids.get()).toEqual([]);
  });

  it('keeps the elements for the next session with the setting', () => {
    simStorage.set(SETTING_STORAGE_KEY, 'ENABLED');
    const elements = new PilotStoredElements();
    elements.storeNavaid(navaid('ABC'));
    elements.storeRoute(route('RTE'));
    localStorage.setItem('A32NX.StoredWaypoints', '[{"ident":"WPT01"}]');
    vi.advanceTimersByTime(5_000);
    expect(simStorage.get(KEPT_COPY_KEY)).toContain('ABC');

    newSession();
    const nextSession = new PilotStoredElements();
    expect(nextSession.navaids.get().map((n) => n.ident)).toEqual(['ABC']);
    expect(nextSession.routes.get().map((r) => r.ident)).toEqual(['RTE']);
    // the pilot stored waypoints of the DataManager too
    expect(localStorage.getItem('A32NX.StoredWaypoints')).toBe('[{"ident":"WPT01"}]');
  });

  it('writes the kept copy only when the elements change', () => {
    simStorage.set(SETTING_STORAGE_KEY, 'ENABLED');
    const setStoredData = vi.fn((key: string, value: string) => simStorage.set(key, value));
    vi.stubGlobal('SetStoredData', setStoredData);
    const elements = new PilotStoredElements();
    elements.storeNavaid(navaid('ABC'));
    vi.advanceTimersByTime(5_000);
    vi.advanceTimersByTime(15_000);
    expect(setStoredData.mock.calls.filter(([key]) => key === KEPT_COPY_KEY)).toHaveLength(1);
    elements.storeNavaid(navaid('DEF'));
    vi.advanceTimersByTime(5_000);
    expect(setStoredData.mock.calls.filter(([key]) => key === KEPT_COPY_KEY)).toHaveLength(2);
  });

  it('does not put the kept elements back within the same session', () => {
    simStorage.set(SETTING_STORAGE_KEY, 'ENABLED');
    simStorage.set(KEPT_COPY_KEY, JSON.stringify({ 'A380X.PilotStoredNavaids': JSON.stringify([navaid('OLD')]) }));
    const elements = new PilotStoredElements();
    expect(elements.navaids.get().map((n) => n.ident)).toEqual(['OLD']);
    elements.deleteAllNavaids();

    // another instrument of the same session
    PilotStoredElementsPersistence.start().stop();
    expect(new PilotStoredElements().navaids.get()).toEqual([]);
  });

  it('saves at once when the setting is enabled, and drops the kept copy when it is disabled', () => {
    new PilotStoredElements().storeNavaid(navaid('ABC'));
    setSetting('ENABLED');
    expect(simStorage.get(KEPT_COPY_KEY)).toContain('ABC');
    setSetting('DISABLED');
    expect(simStorage.get(KEPT_COPY_KEY)).toBe('');

    newSession();
    expect(new PilotStoredElements().navaids.get()).toEqual([]);
  });

  it('does not put the kept elements back when the setting was disabled for the next session', () => {
    simStorage.set(KEPT_COPY_KEY, JSON.stringify({ 'A380X.PilotStoredNavaids': JSON.stringify([navaid('OLD')]) }));
    expect(new PilotStoredElements().navaids.get()).toEqual([]);
  });
});
