// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject, Subscribable } from '@microsoft/msfs-sdk';
import { ChecklistState } from '../../../MsfsAvionicsCommon/providers/FwsPublisher';
import { appearedEcamAlerts, ecamAlertTitle } from '../TechLogbook';

export type EcamAlertColour = 'red' | 'amber' | 'white';

/** One appearance of an ECAM alert during the flight */
export interface EcamAlertEntry {
  /** Unique for the appearance: an alert that comes back is a new entry */
  readonly occurrence: number;
  readonly id: string;
  /** The title without colour codes */
  readonly title: string;
  readonly colour: EcamAlertColour;
  /** ms since the epoch (UTC) */
  readonly time: number;
  /** The alert is still active */
  readonly active: boolean;
  /** Removed from the list with the recycle bin, until RESTORE ALL */
  readonly hidden: boolean;
}

/**
 * The colour of an alert on the EWD: the first colour code of its title (red or amber, white without one).
 * @param ewdTitle the title with its colour codes
 * @returns the colour
 */
export function ecamAlertColour(ewdTitle: string): EcamAlertColour {
  // eslint-disable-next-line no-control-regex
  const match = /\x1b<([0-9])m/.exec(ewdTitle);
  if (match === null) {
    return 'white';
  }
  return match[1] === '2' ? 'red' : match[1] === '4' ? 'amber' : 'white';
}

/**
 * The ECAM alerts of the flight for the ECAM ALERTS tab, newest first. It belongs to the laptop, so that the list
 * survives the pages being rebuilt. The list is empty at the start of the laptop and after the flight closure, and it
 * stays frozen while the avionics data do not reach the laptop.
 */
export class OpsLibraryEcamAlerts {
  private readonly _entries = Subject.create<readonly EcamAlertEntry[]>([]);
  /** The alerts, newest first */
  public readonly entries = this._entries as Subscribable<readonly EcamAlertEntry[]>;

  private activeIds: string[] = [];

  private nextOccurrence = 1;

  /**
   * The procedure state of each appearance, for the SEARCH link; kept after the alert clears, and for the whole flight
   * like its row (both are emptied together), as a state is a few short arrays
   */
  private readonly lastStates = new Map<number, ChecklistState>();

  private flightIndex: number | null = null;

  /** @param ewdTitleOf the EWD title of an alert id, with its colour codes */
  constructor(private readonly ewdTitleOf: (alertId: string) => string) {}

  /**
   * The active abnormal procedures changed.
   * @param states the procedure states of the active alerts
   * @param time ms since the epoch (UTC)
   * @param avionicsDataAvailable the avionics data reach the laptop; without them the list is frozen
   */
  public update(states: readonly ChecklistState[], time: number, avionicsDataAvailable: boolean): void {
    if (!avionicsDataAvailable) {
      return;
    }
    const ids = states.map((state) => state.id);
    const appeared = appearedEcamAlerts(this.activeIds, ids);
    this.activeIds = ids;

    let entries = this._entries.get();
    let changed = false;
    for (const id of appeared) {
      const ewdTitle = this.ewdTitleOf(id);
      const entry: EcamAlertEntry = {
        occurrence: this.nextOccurrence++,
        id,
        title: ecamAlertTitle(ewdTitle),
        colour: ecamAlertColour(ewdTitle),
        time,
        active: true,
        hidden: false,
      };
      entries = [entry, ...entries];
      changed = true;
    }
    // Only the newest entry of an id follows the alert: the older ones are earlier appearances that have cleared
    const stillActive = new Set(ids);
    const seenIds = new Set<string>();
    entries = entries.map((entry) => {
      const isNewestOfId = !seenIds.has(entry.id);
      seenIds.add(entry.id);
      const active = isNewestOfId && stillActive.has(entry.id);
      if (active) {
        const state = states.find((s) => s.id === entry.id);
        if (state !== undefined) {
          this.lastStates.set(entry.occurrence, state);
        }
      }
      if (active !== entry.active) {
        changed = true;
        return { ...entry, active };
      }
      return entry;
    });
    if (changed) {
      this._entries.set(entries);
    }
  }

  /**
   * @param occurrence the appearance of the alert
   * @returns the procedure state of an alert as it was last published, null when none was seen
   */
  public lastState(occurrence: number): ChecklistState | null {
    return this.lastStates.get(occurrence) ?? null;
  }

  /**
   * The recycle bin of a row
   * @param occurrence the appearance of the alert
   */
  public hide(occurrence: number): void {
    this._entries.set(this._entries.get().map((e) => (e.occurrence === occurrence ? { ...e, hidden: true } : e)));
  }

  /** RESTORE ALL */
  public restoreAll(): void {
    this._entries.set(this._entries.get().map((e) => (e.hidden ? { ...e, hidden: false } : e)));
  }

  /** @returns the alerts shown in the list */
  public visible(): EcamAlertEntry[] {
    return this._entries.get().filter((e) => !e.hidden);
  }

  /** @returns whether RESTORE ALL has a row to bring back */
  public hasHidden(): boolean {
    return this._entries.get().some((e) => e.hidden);
  }

  /**
   * The flight of the eLogbook: its closure starts the next flight and empties the list.
   * @param index the flight index of the logbook
   */
  public onFlightIndex(index: number): void {
    if (this.flightIndex !== null && index !== this.flightIndex) {
      this.reset();
    }
    this.flightIndex = index;
  }

  /** The laptop starts again: a real laptop has no memory of the previous session */
  public reset(): void {
    this._entries.set([]);
    this.activeIds = [];
    this.lastStates.clear();
  }
}
