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
 *
 * One instance per instrument (the browser storage is shared by its FMCs): {@link start} creates it or returns it.
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

  private static instance: PilotStoredElementsPersistence | null = null;

  /**
   * At the start of a sim session, puts the kept elements back in the browser storage when the setting is enabled, then
   * keeps the copy up to date. Must run before the pilot stored elements are read.
   * @returns the instance of this instrument
   */
  public static start(): PilotStoredElementsPersistence {
    PilotStoredElementsPersistence.instance ??= new PilotStoredElementsPersistence();
    return PilotStoredElementsPersistence.instance;
  }

  private enabled = NXDataStore.getLegacy(PilotStoredElementsPersistence.SETTING_KEY, 'DISABLED') === 'ENABLED';

  private lastSaved: string | null = null;

  private readonly cancelSettingSubscription: () => void;

  private readonly saveInterval: ReturnType<typeof setInterval>;

  private constructor() {
    if (localStorage.getItem(PilotStoredElementsPersistence.SESSION_KEY) === null) {
      localStorage.setItem(PilotStoredElementsPersistence.SESSION_KEY, '1');
      if (this.enabled) {
        this.restore();
      }
    }

    this.cancelSettingSubscription = NXDataStore.subscribeLegacy(
      PilotStoredElementsPersistence.SETTING_KEY,
      (_, value) => {
        this.enabled = value === 'ENABLED';
        if (this.enabled) {
          this.save();
        } else {
          // Back to the FCOM behaviour: nothing is kept for the next session
          SetStoredData(PilotStoredElementsPersistence.PERSISTENT_KEY, '');
          this.lastSaved = null;
        }
      },
    );

    this.saveInterval = setInterval(() => {
      if (this.enabled) {
        this.save();
      }
    }, PilotStoredElementsPersistence.SAVE_INTERVAL_MS);
  }

  /** Stops keeping the copy up to date; the next {@link start} creates a new instance. */
  public stop(): void {
    clearInterval(this.saveInterval);
    this.cancelSettingSubscription();
    if (PilotStoredElementsPersistence.instance === this) {
      PilotStoredElementsPersistence.instance = null;
    }
  }

  private snapshot(): string {
    const elements: Record<string, string> = {};
    for (const key of PilotStoredElementsPersistence.STORAGE_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) {
        elements[key] = value;
      }
    }
    return JSON.stringify(elements);
  }

  private save(): void {
    const snapshot = this.snapshot();
    if (snapshot !== this.lastSaved) {
      SetStoredData(PilotStoredElementsPersistence.PERSISTENT_KEY, snapshot);
      this.lastSaved = snapshot;
    }
  }

  private restore(): void {
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
      this.lastSaved = kept;
    } catch (e) {
      console.warn('[FMS] Could not restore the kept pilot stored elements:', e);
    }
  }
}
