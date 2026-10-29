// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject, Subscribable } from '@microsoft/msfs-sdk';
import { NXDataStore } from '@flybywiresim/fbw-sdk';
import { DocumentSearchIndex, SearchHit, SearchQuery } from '../../Pages/FltOps/Shared/DocumentSearch';
import { FltOpsLaptopIndex } from '../FltOpsStatusSync';
import { TechLogbookState } from '../TechLogbook';
import content from './ops-library-content.json';
import { OpsLibraryCatalog, OpsLibraryContentFile } from './OpsLibraryContent';
import { OpsLibraryCheckRunner, checkManual } from './OpsLibraryCheck';
import { OpsLibraryConsultation } from './OpsLibraryConsultation';
import { OpsLibraryEcamAlerts } from './OpsLibraryEcamAlerts';
import { OpsLibraryUserData } from './OpsLibraryUserData';
import { LogbookStatusRows, logbookStatusRows, mmelReferencesOf } from './OpsLibraryLogbookStatus';

/** The tabs of the home page, in order */
export const OPS_LIBRARY_TABS = ['LIBRARY', 'ECAM ALERTS', 'LOGBOOK STATUS', 'SEARCH', 'BOOKMARKS', 'ABOUT'] as const;

/** Design choice: each laptop keeps its own Pilot folder, notes and check dates, as each keeps its own logbook view */
const STORAGE_KEYS: Readonly<Record<FltOpsLaptopIndex, string>> = {
  1: 'OIS_OPS_LIBRARY_CAPT',
  2: 'OIS_OPS_LIBRARY_FO',
};

/**
 * The OPS LIBRARY of a laptop: the documents, what the crew keeps, the consultation, the ECAM alerts of the flight and
 * the state of the home page. It lives as long as the laptop session, so that leaving the application with the switching
 * bar and coming back finds everything as it was.
 */
export class OpsLibrarySession {
  public readonly catalog = new OpsLibraryCatalog(content as unknown as OpsLibraryContentFile, this.ecamProcedures);

  public readonly userData = new OpsLibraryUserData({
    read: () => NXDataStore.getLegacy(STORAGE_KEYS[this.laptopIndex], ''),
    write: (text) => NXDataStore.setLegacy(STORAGE_KEYS[this.laptopIndex], text),
  });

  public readonly consultation = new OpsLibraryConsultation(this.catalog, this.userData);

  public readonly ecamAlerts = new OpsLibraryEcamAlerts((id) => this.ecamProcedures[id]?.title ?? id);

  public readonly checks = new OpsLibraryCheckRunner();

  /** The selected tab of the home page */
  public readonly tabIndex = Subject.create(0);

  private readonly _searchHits = Subject.create<readonly SearchHit[] | null>(null);
  /** The hits of the last search of the SEARCH tab, null before one */
  public readonly searchHits = this._searchHits as Subscribable<readonly SearchHit[] | null>;

  private lastQuery: SearchQuery | null = null;

  /** The ECAM alerts reach the laptop: false while the avionics data do not (the list is frozen) */
  public readonly avionicsAvailable = Subject.create(true);

  private logbookRead = false;

  private readonly _logbook = Subject.create<TechLogbookState | null>(null);

  /** The deferred items of the eLogbook as the FLT OPS domain last read them; session-long, never destroyed */
  public readonly logbookRows: Subscribable<LogbookStatusRows> = this._logbook.map(logbookStatusRows);

  /** @returns whether the eLogbook has been read in this session */
  public hasReadLogbook(): boolean {
    return this.logbookRead;
  }

  /**
   * The eLogbook status was read (first display, SYNCHRO LOGBOOK): its deferred items become MMEL entries.
   * @param logbook the eLogbook, null when there is none
   */
  public setLogbook(logbook: TechLogbookState | null): void {
    this.logbookRead = true;
    this._logbook.set(logbook);
    this.catalog.setMmelReferences(mmelReferencesOf(logbookStatusRows(logbook)));
  }

  private searchIndex: DocumentSearchIndex | null = null;

  /**
   * @param laptopIndex 1: the Captain's laptop, 2: the First Officer's
   * @param ecamProcedures the abnormal procedures of the ECAM by alert id; given in, as the procedure tables load only
   * in the instrument
   */
  constructor(
    private readonly laptopIndex: FltOpsLaptopIndex,
    private readonly ecamProcedures: Readonly<Record<string, { title: string }>>,
  ) {}

  /** @returns the word search index, built when the first search runs */
  public wordSearchIndex(): DocumentSearchIndex {
    if (this.searchIndex === null) {
      this.searchIndex = new DocumentSearchIndex(this.catalog.searchEntries());
    }
    return this.searchIndex;
  }

  /**
   * @param hits the hits to list in the RESULTS frame
   * @param query the word search that found them, null for an ECAM or functional code search
   */
  public setSearchHits(hits: readonly SearchHit[], query: SearchQuery | null): void {
    this.lastQuery = query;
    this._searchHits.set(hits);
  }

  /** @returns the word search that found the listed hits, null when the hits are not from a word search */
  public searchQuery(): SearchQuery | null {
    return this.lastQuery;
  }

  /**
   * Called every laptop update: the check of a manual advances.
   * @param now sim time, ms since the epoch
   * @param laptopOn the laptop is running
   */
  public update(now: number, laptopOn: boolean): void {
    const ended = this.checks.update(now, laptopOn);
    if (ended === null) {
      return;
    }
    const manual = this.catalog.manual(ended.manualId);
    if (manual === undefined) {
      return;
    }
    this.userData.recordCheck(ended.manualId, {
      result: ended.outcome === 'aborted' ? 'aborted' : checkManual(manual),
      date: now,
    });
  }

  /** ORGANIZE of the bookmarks: leaves the consultation for the BOOKMARKS tab of the home page */
  public showBookmarksTab(): void {
    this.tabIndex.set(OPS_LIBRARY_TABS.indexOf('BOOKMARKS'));
    this.consultation.close();
  }

  /** The laptop starts again: the home page and consultation start over, the stored data stay */
  public reset(): void {
    this.consultation.reset();
    this.ecamAlerts.reset();
    this.tabIndex.set(0);
    this._searchHits.set(null);
    this.lastQuery = null;
    this.logbookRead = false;
    this._logbook.set(null);
    this.catalog.setMmelReferences([]);
  }
}
