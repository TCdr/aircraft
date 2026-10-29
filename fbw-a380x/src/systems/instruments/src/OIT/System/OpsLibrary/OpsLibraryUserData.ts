// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject, Subscribable } from '@microsoft/msfs-sdk';
import { DocumentNotes } from '../../Pages/FltOps/Shared/DocumentNotes';

/** Where the data of a laptop is kept between sessions (the legacy NXDataStore in the instrument) */
export interface OpsLibraryStorage {
  read(): string;
  write(text: string): void;
}

export type OpsLibraryCheckResult = 'success' | 'failed' | 'aborted';

/** The outcome of the last CHECK of a manual */
export interface OpsLibraryCheckRecord {
  readonly result: OpsLibraryCheckResult;
  /** ms since the epoch (UTC) */
  readonly date: number;
}

/** Design choice: the Trace folder keeps the units consulted last */
export const TRACE_LENGTH = 20;

/** The folders of the BOOKMARKS tab */
export interface BookmarkFolder {
  readonly name: 'Trace' | 'Interruption' | 'Airline' | 'Pilot';
  readonly unitIds: readonly string[];
}

/**
 * What the crew keeps in the OPS LIBRARY of one laptop: the Pilot bookmarks, the notes and the dates of the checks
 * (stored); the Trace and Interruption folders (this session only, as they follow the consultation).
 */
export class OpsLibraryUserData {
  public readonly notes = new DocumentNotes(() => {
    this._notesVersion.set(this._notesVersion.get() + 1);
    this.changed();
  });

  private bookmarks: string[] = [];

  private trace: string[] = [];

  private interruption: string | null = null;

  private checks: Record<string, OpsLibraryCheckRecord> = {};

  private readonly _version = Subject.create(0);
  /** Counts the changes, for the views */
  public readonly version = this._version as Subscribable<number>;

  private readonly _notesVersion = Subject.create(0);
  /** Counts the changes of the notes: a note adds or removes a line of the navigation tree */
  public readonly notesVersion = this._notesVersion as Subscribable<number>;

  constructor(private readonly storage: OpsLibraryStorage) {
    this.load();
  }

  private load(): void {
    let stored: unknown = null;
    try {
      stored = JSON.parse(this.storage.read());
    } catch {
      stored = null;
    }
    const record = stored !== null && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
    if (record.version !== 1) {
      return;
    }
    if (Array.isArray(record.bookmarks)) {
      this.bookmarks = record.bookmarks.filter((id): id is string => typeof id === 'string');
    }
    this.notes.load(record.notes);
    const checks = record.checks;
    if (checks !== null && typeof checks === 'object') {
      for (const manualId of Object.keys(checks as Record<string, unknown>)) {
        const entry = (checks as Record<string, { result?: unknown; date?: unknown } | null>)[manualId];
        if (
          entry !== null &&
          typeof entry === 'object' &&
          (entry.result === 'success' || entry.result === 'failed' || entry.result === 'aborted') &&
          typeof entry.date === 'number'
        ) {
          this.checks[manualId] = { result: entry.result, date: entry.date };
        }
      }
    }
  }

  private changed(): void {
    this.storage.write(
      JSON.stringify({ version: 1, bookmarks: this.bookmarks, notes: this.notes.toRecord(), checks: this.checks }),
    );
    this.touch();
  }

  private touch(): void {
    this._version.set(this._version.get() + 1);
  }

  /** @returns the Pilot bookmarks, the unit ids in the order they were added */
  public bookmarkIds(): readonly string[] {
    return this.bookmarks;
  }

  /**
   * ADD TO LIST: a unit already in the list is not added twice
   * @param unitId the unit id
   */
  public addBookmark(unitId: string): void {
    if (!this.bookmarks.includes(unitId)) {
      this.bookmarks = [...this.bookmarks, unitId];
      this.changed();
    }
  }

  /**
   * DELETE
   * @param unitId the unit id
   */
  public deleteBookmark(unitId: string): void {
    if (this.bookmarks.includes(unitId)) {
      this.bookmarks = this.bookmarks.filter((id) => id !== unitId);
      this.changed();
    }
  }

  /** CLEAR (Pilot folder) */
  public clearBookmarks(): void {
    if (this.bookmarks.length > 0) {
      this.bookmarks = [];
      this.changed();
    }
  }

  /**
   * A unit was consulted: it goes first in the Trace, without a repeat
   * @param unitId the unit id
   */
  public recordVisit(unitId: string): void {
    this.trace = [unitId, ...this.trace.filter((id) => id !== unitId)].slice(0, TRACE_LENGTH);
    this.touch();
  }

  /**
   * The unit that was open when the application closed
   * @param unitId the unit id
   */
  public setInterruption(unitId: string | null): void {
    this.interruption = unitId;
    this.touch();
  }

  /** @returns the folders of the BOOKMARKS tab; the Airline folder is empty (Design choice: no airline content) */
  public folders(): BookmarkFolder[] {
    return [
      { name: 'Trace', unitIds: this.trace },
      { name: 'Interruption', unitIds: this.interruption !== null ? [this.interruption] : [] },
      { name: 'Airline', unitIds: [] },
      { name: 'Pilot', unitIds: this.bookmarks },
    ];
  }

  /**
   * @param manualId the manual
   * @returns the last check of the manual, null when it was never checked
   */
  public checkOf(manualId: string): OpsLibraryCheckRecord | null {
    return this.checks[manualId] ?? null;
  }

  /**
   * @param manualId the manual that was checked
   * @param record how the check ended
   */
  public recordCheck(manualId: string, record: OpsLibraryCheckRecord): void {
    this.checks = { ...this.checks, [manualId]: record };
    this.changed();
  }
}
