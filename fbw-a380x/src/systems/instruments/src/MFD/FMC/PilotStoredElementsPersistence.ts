// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { NXDataStore } from '@flybywiresim/fbw-sdk';

/**
 * Keeps the pilot stored elements database (waypoints, NAVAIDs, routes and runways) from one sim session to the next,
 * when the flypad setting KEEP_PILOT_STORED_ELEMENTS is enabled.
 *
 * The A380 FCOM (DSC-22-FMS, pilot-stored elements database) deletes all the pilot-stored elements when all the FMCs are
 * shut down, which is what happens without the setting: the elements are kept in the browser storage, which lives as long
 * as the sim session. With the setting, a copy is kept in the sim persistent storage, and put back in the browser storage
 * at the start of the next session, before the FMS reads it.
 */
export class PilotStoredElementsPersistence {
  /** The flypad setting (stored as A380X_KEEP_PILOT_STORED_ELEMENTS, ENABLED or DISABLED) */
  public static readonly SETTING_KEY = 'KEEP_PILOT_STORED_ELEMENTS';

  /** The copy in the sim persistent storage: not an NXDataStore setting, so that it is not broadcast to all instruments */
  private static readonly PERSISTENT_KEY = 'A380X_PILOT_STORED_ELEMENTS';

  /** The browser storage keys of the database: the waypoints (DataManager), the NAVAIDs, routes and runways */
  private static readonly STORAGE_KEYS = [
    'A32NX.StoredWaypoints',
    'A380X.PilotStoredNavaids',
    'A380X.PilotStoredRoutes',
    'A380X.PilotStoredRunways',
  ];

  /** Set in the browser storage once the session has started: the elements are then those of the session */
  private static readonly SESSION_KEY = 'A380X.PilotStoredElementsSession';

  private static readonly SAVE_INTERVAL_MS = 5_000;

  private static started = false;

  private static enabled = false;

  private static lastSaved: string | null = null;

  /**
   * At the start of a sim session, puts the kept elements back in the browser storage when the setting is enabled, then
   * keeps the copy up to date. Once per instrument; must run before the pilot stored elements are read.
   */
  public static start(): void {
    if (PilotStoredElementsPersistence.started) {
      return;
    }
    PilotStoredElementsPersistence.started = true;

    PilotStoredElementsPersistence.enabled =
      NXDataStore.getLegacy(PilotStoredElementsPersistence.SETTING_KEY, 'DISABLED') === 'ENABLED';

    if (localStorage.getItem(PilotStoredElementsPersistence.SESSION_KEY) === null) {
      localStorage.setItem(PilotStoredElementsPersistence.SESSION_KEY, '1');
      if (PilotStoredElementsPersistence.enabled) {
        PilotStoredElementsPersistence.restore();
      }
    }

    NXDataStore.subscribeLegacy(PilotStoredElementsPersistence.SETTING_KEY, (_, value) => {
      PilotStoredElementsPersistence.enabled = value === 'ENABLED';
      if (PilotStoredElementsPersistence.enabled) {
        PilotStoredElementsPersistence.save();
      } else {
        // Back to the FCOM behaviour: nothing is kept for the next session
        SetStoredData(PilotStoredElementsPersistence.PERSISTENT_KEY, '');
        PilotStoredElementsPersistence.lastSaved = null;
      }
    });

    setInterval(() => {
      if (PilotStoredElementsPersistence.enabled) {
        PilotStoredElementsPersistence.save();
      }
    }, PilotStoredElementsPersistence.SAVE_INTERVAL_MS);
  }

  private static snapshot(): string {
    const elements: Record<string, string> = {};
    for (const key of PilotStoredElementsPersistence.STORAGE_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) {
        elements[key] = value;
      }
    }
    return JSON.stringify(elements);
  }

  private static save(): void {
    const snapshot = PilotStoredElementsPersistence.snapshot();
    if (snapshot !== PilotStoredElementsPersistence.lastSaved) {
      SetStoredData(PilotStoredElementsPersistence.PERSISTENT_KEY, snapshot);
      PilotStoredElementsPersistence.lastSaved = snapshot;
    }
  }

  private static restore(): void {
    try {
      const kept = GetStoredData(PilotStoredElementsPersistence.PERSISTENT_KEY);
      if (!kept) {
        return;
      }
      const elements = JSON.parse(kept) as Record<string, unknown>;
      for (const key of PilotStoredElementsPersistence.STORAGE_KEYS) {
        const value = elements[key];
        if (typeof value === 'string') {
          localStorage.setItem(key, value);
        }
      }
      PilotStoredElementsPersistence.lastSaved = kept;
    } catch (e) {
      console.warn('[FMS] Could not restore the kept pilot stored elements:', e);
    }
  }
}
