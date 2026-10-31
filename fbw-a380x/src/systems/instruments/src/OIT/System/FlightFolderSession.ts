// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MappedSubject, Subject, Subscribable, Subscription } from '@microsoft/msfs-sdk';
import type { ISimbriefData } from '@flybywiresim/fbw-sdk';
import { FlightFolder, EffSyncState } from './FlightFolder';
import { buildFlightFolderTree } from './FlightFolderDocuments';
import {
  buildFlightPlan,
  EffFuelKey,
  EffLoadKey,
  EffNavLogActual,
  EffNavLogFollowUp,
  NextWaypointOutcome,
} from './FlightFolderFlightPlan';
import { FollowUpAvionics, FollowUpSample, FollowUpSampler } from './FlightFolderFollowUp';
import { FltOpsLaptopIndex } from './FltOpsStatusSync';
import { effExportIdentifier, effFolderLabel, effFromOfp, effIdentifier, LoadBoxItem } from './OisLoadBox';

/*
 * The electronic flight folders (EFFs) of one FLT OPS laptop: the ones imported from the LOAD BOX, the current one, and
 * who is the master of the flight follow-up. The folders live on the laptop until their export or closure; they are
 * kept in memory only (Design choice: the LOAD BOX and EXPORT BOX are not kept either).
 */

/** An EFF loaded into the laptop that the FLT FOLDER has not imported yet */
export interface PendingImport {
  readonly id: string;
  readonly label: string;
  /** What the data is: the whole flight folder */
  readonly typeText: string;
  readonly generatedMs: number | null;
  readonly ofp: ISimbriefData;
}

export interface FlightFolderLoadedMessage {
  readonly sender: FltOpsLaptopIndex;
  readonly identifier: string;
  readonly generatedMs: number | null;
}

/** The FLT FOLDER exchanges between the CAPT and F/O laptops, synced to the other OIT instrument */
export interface FlightFolderNetworkEvents {
  /** The crew of a laptop loaded an EFF: the other laptop loads it too */
  oisEffLoaded: FlightFolderLoadedMessage;
  /** A laptop promoted an EFF to the current one */
  oisEffCurrent: { readonly sender: FltOpsLaptopIndex; readonly identifier: string };
  /** A laptop became the master */
  oisEffMaster: { readonly sender: FltOpsLaptopIndex };
  /** SYNCHRONIZE WITH OFFSIDE */
  oisEffSynchronize: { readonly sender: FltOpsLaptopIndex; readonly sync: EffSyncState };
  /** REFRESH: a laptop asks the other one for the flight follow-up of the current folder */
  oisEffRefreshRequest: { readonly sender: FltOpsLaptopIndex; readonly identifier: string };
  /** The answer to a REFRESH */
  oisEffRefreshReply: {
    readonly sender: FltOpsLaptopIndex;
    readonly identifier: string;
    readonly followUp: EffNavLogFollowUp;
  };
}

/** How a laptop reaches the other laptop */
export interface FlightFolderNetwork {
  sendCurrent(message: FlightFolderNetworkEvents['oisEffCurrent']): void;
  sendMaster(message: FlightFolderNetworkEvents['oisEffMaster']): void;
  sendSynchronize(message: FlightFolderNetworkEvents['oisEffSynchronize']): void;
  sendRefreshRequest(message: FlightFolderNetworkEvents['oisEffRefreshRequest']): void;
  sendRefreshReply(message: FlightFolderNetworkEvents['oisEffRefreshReply']): void;
}

/**
 * @param ofp the airline OFP
 * @param metric whether the aircraft shows tonnes
 * @returns its electronic flight folder
 */
export function flightFolderFromOfp(ofp: ISimbriefData, metric: boolean): FlightFolder {
  const eff = effFromOfp(ofp);
  const plan = buildFlightPlan(ofp);
  return new FlightFolder(
    effIdentifier(eff),
    effFolderLabel(eff),
    plan.generatedMs,
    buildFlightFolderTree(ofp, metric),
    plan,
    effExportIdentifier(eff),
  );
}

export class FlightFolderSession {
  private readonly _folders = Subject.create<readonly FlightFolder[]>([]);
  public readonly folders = this._folders as Subscribable<readonly FlightFolder[]>;

  private readonly _currentId = Subject.create<string | null>(null);
  public readonly currentId = this._currentId as Subscribable<string | null>;

  /** The current folder, null before the first import */
  public readonly current: Subscribable<FlightFolder | null> = MappedSubject.create(
    ([folders, id]) => folders.find((folder) => folder.id === id) ?? null,
    this._folders,
    this._currentId,
  );

  private readonly _storeAvailable = Subject.create(false);
  /** Whether STORE can be used: there is a current folder and it is not closed */
  public readonly storeAvailable = this._storeAvailable as Subscribable<boolean>;

  private readonly _pending = Subject.create<readonly PendingImport[]>([]);
  /** The EFFs loaded and not imported: the import pop-up lists them */
  public readonly pending = this._pending as Subscribable<readonly PendingImport[]>;

  private readonly _isMaster = Subject.create(false);
  /** This laptop is the master of the flight follow-up of the current folder */
  public readonly isMaster = this._isMaster as Subscribable<boolean>;

  private launchStartedMs: number | null = null;

  private readonly followUpSampler = new FollowUpSampler();
  /** The folder the sampler works for: another current folder starts the sampling again */
  private sampledFolderId: string | null = null;
  /** This laptop asked for a REFRESH and waits for the answer */
  private refreshPending = false;

  /**
   * The start-up window of the application: the first display after the laptop is powered takes the time of a
   * start-up, the next displays are immediate.
   * @param nowMs the real time, ms
   * @returns how long the start-up has been running
   */
  public launchElapsedMs(nowMs: number): number {
    if (this.launchStartedMs === null) {
      this.launchStartedMs = nowMs;
    }
    return nowMs - this.launchStartedMs;
  }

  /** The laptop powers down: the next display of the application starts it up again */
  public resetLaunch(): void {
    this.launchStartedMs = null;
  }

  /** The folder the other laptop made current before this laptop could import it */
  private promotedByOffside: string | null = null;

  /**
   * @param index the laptop
   * @param network the link to the other laptop
   * @param metric whether the aircraft shows tonnes, read when a folder is built
   * @param addToExportBox puts a DATA IDENTIFIER into the EXPORT BOX
   */
  constructor(
    private readonly index: FltOpsLaptopIndex,
    private readonly network: FlightFolderNetwork,
    private readonly metric: () => boolean,
    private readonly addToExportBox: (identifier: string, source: string, nowMs: number) => void,
  ) {
    let folderChanges: Subscription | null = null;
    this.current.sub((folder) => {
      folderChanges?.destroy();
      const update = () => this._storeAvailable.set(folder !== null && !folder.closed);
      folderChanges = folder?.changed.sub(update) ?? null;
      update();
    }, true);
  }

  /**
   * The LOAD BOX loaded items into this laptop: the new ones, or newer OFPs of a known flight, wait to be imported
   * @param items every item loaded into this laptop
   */
  public onLoaded(items: readonly LoadBoxItem[]): void {
    let pending = this._pending.get();
    for (const item of items) {
      const folder = this._folders.get().find((f) => f.id === item.identifier);
      const waiting = pending.find((p) => p.id === item.identifier);
      if (
        (folder && folder.generatedMs === item.generatedMs) ||
        (waiting && waiting.generatedMs === item.generatedMs)
      ) {
        continue;
      }
      pending = [
        ...pending.filter((p) => p.id !== item.identifier),
        {
          id: item.identifier,
          label: effFolderLabel(item.eff),
          typeText: 'FULL',
          generatedMs: item.generatedMs,
          ofp: item.ofp,
        },
      ];
    }
    this._pending.set(pending);
  }

  /**
   * DISPLAY AS CURRENT or DISPLAY of the import pop-up
   * @param ids the identifiers chosen in the list
   * @param asCurrent whether the first one becomes the current folder
   * @returns the folders imported
   */
  public importPending(ids: readonly string[], asCurrent: boolean): FlightFolder[] {
    const chosen = this._pending.get().filter((p) => ids.includes(p.id));
    if (chosen.length === 0) {
      return [];
    }
    const built = chosen.map((p) => flightFolderFromOfp(p.ofp, this.metric()));
    this._folders.set([...this._folders.get().filter((f) => !built.some((b) => b.id === f.id)), ...built]);
    this._pending.set(this._pending.get().filter((p) => !ids.includes(p.id)));
    if (asCurrent) {
      this.setCurrent(built[0].id);
    } else if (built.some((folder) => folder.id === this.promotedByOffside)) {
      this._currentId.set(this.promotedByOffside);
      this.promotedByOffside = null;
    }
    return built;
  }

  /**
   * @param id the folder to make current: its promotion reaches the other laptop
   * @returns whether the folder exists on this laptop
   */
  public setCurrent(id: string): boolean {
    if (!this._folders.get().some((f) => f.id === id)) {
      return false;
    }
    if (this._currentId.get() !== id) {
      this._isMaster.set(false);
    }
    this.promotedByOffside = null;
    this._currentId.set(id);
    this.network.sendCurrent({ sender: this.index, identifier: id });
    return true;
  }

  /** @param message the other laptop promoted a folder: this one does the same, importing it first if it was loaded */
  public receiveCurrent(message: FlightFolderNetworkEvents['oisEffCurrent']): void {
    if (message.sender === this.index) {
      return;
    }
    if (!this._folders.get().some((f) => f.id === message.identifier)) {
      this.promotedByOffside = message.identifier;
      this.importPending([message.identifier], false);
    }
    if (this._folders.get().some((f) => f.id === message.identifier) && this._currentId.get() !== message.identifier) {
      this._isMaster.set(false);
      this._currentId.set(message.identifier);
      this.promotedByOffside = null;
    }
  }

  /** GET MASTER: this laptop becomes the master, the other one is not any more */
  public takeMaster(): void {
    this._isMaster.set(true);
    this.network.sendMaster({ sender: this.index });
  }

  /** @param message the other laptop became the master */
  public receiveMaster(message: FlightFolderNetworkEvents['oisEffMaster']): void {
    if (message.sender !== this.index) {
      this._isMaster.set(false);
    }
  }

  /**
   * EXPORT: the current folder goes to the EXPORT BOX. The export before push back leaves the folder open, the full
   * export after the flight closes it.
   * @param kind the export
   * @param nowMs the time, unix ms
   * @returns the names of the documents exported, empty when there is no open current folder
   */
  public exportCurrent(kind: 'cfp' | 'full', nowMs: number): string[] {
    const folder = this.current.get();
    if (!folder || folder.closed) {
      return [];
    }
    const names = folder.exportContent(kind);
    folder.markExported(kind);
    this.addToExportBox(folder.exportIdentifier, 'FLT FOLDER', nowMs);
    return names;
  }

  /** FLIGHT CLOSURE: the current folder is closed, nothing is exported */
  public closeFlight(): void {
    this.current.get()?.close();
  }

  /** SYNCHRONIZE WITH OFFSIDE: the other laptop takes the documents' state and entries of the current folder */
  public synchronize(): void {
    const folder = this.current.get();
    if (folder) {
      this.network.sendSynchronize({ sender: this.index, sync: folder.syncState() });
    }
  }

  /** @param message the other laptop's state of a folder */
  public receiveSynchronize(message: FlightFolderNetworkEvents['oisEffSynchronize']): void {
    if (message.sender === this.index) {
      return;
    }
    this._folders
      .get()
      .find((f) => f.id === message.sync.identifier)
      ?.applySyncState(message.sync);
  }

  /**
   * STORE: an application page goes into the current folder
   * @param code the application code
   * @param text the page as text
   * @returns the document name, null when there is no open current folder
   */
  public store(code: string, text: string): string | null {
    return this.current.get()?.store(code, text) ?? null;
  }

  /**
   * ADMINISTRATOR FUNCTIONS: the closed folders leave the laptop (a closed folder cannot be changed any more)
   * @returns how many folders were removed
   */
  public removeClosedFolders(): number {
    const closed = this._folders.get().filter((folder) => folder.closed);
    if (closed.length === 0) {
      return 0;
    }
    this._folders.set(this._folders.get().filter((folder) => !folder.closed));
    if (closed.some((folder) => folder.id === this._currentId.get())) {
      this._currentId.set(null);
      this._isMaster.set(false);
    }
    return closed.length;
  }

  /** @returns the current folder when this laptop may change its flight follow-up: it is the master and the folder open */
  private editableFolder(): FlightFolder | null {
    const folder = this.current.get();
    return folder !== null && !folder.closed && this._isMaster.get() ? folder : null;
  }

  /**
   * @param folderId a folder
   * @returns whether this laptop may change the flight follow-up of the folder now: it is the open current folder and
   * this laptop is the master. A window that was opened for a folder asks again before it applies its entry.
   */
  public canEditFollowUp(folderId: string): boolean {
    return this.editableFolderOf(folderId) !== null;
  }

  /**
   * @param folderId a folder
   * @returns the folder when it is the one this laptop may change now
   */
  private editableFolderOf(folderId: string): FlightFolder | null {
    const folder = this.editableFolder();
    return folder?.id === folderId ? folder : null;
  }

  /**
   * @param folder a folder
   * @returns whether this laptop may change the flight plan of the folder, kept up to date: it follows GET MASTER on
   * either laptop, the promotion of another folder and the closure of the folder. The caller destroys it.
   */
  public followUpEditable(folder: FlightFolder): Subscribable<boolean> & Subscription {
    return MappedSubject.create(
      () => this.canEditFollowUp(folder.id),
      // A flight closure closes the folder without changing who is current or master
      folder.changed,
      this.isMaster,
      this.currentId,
    );
  }

  /**
   * An Update cell of the FUEL lines of the flight plan
   * @param folderId the folder the cell belongs to
   * @param key the fuel line
   * @param kg the crew's entry in kg, null to remove it
   * @returns whether the entry was kept; rejected unless this laptop may change the folder (see canEditFollowUp)
   */
  public setFuelUpdate(folderId: string, key: EffFuelKey, kg: number | null): boolean {
    return this.editableFolderOf(folderId)?.setFuelUpdate(key, kg) ?? false;
  }

  /**
   * An Update cell of the LOAD lines of the flight plan
   * @param folderId the folder the cell belongs to
   * @param key the load line
   * @param kg the crew's entry in kg, null to remove it
   * @returns whether the entry was kept; rejected unless this laptop may change the folder (see canEditFollowUp)
   */
  public setLoadUpdate(folderId: string, key: EffLoadKey, kg: number | null): boolean {
    return this.editableFolderOf(folderId)?.setLoadUpdate(key, kg) ?? false;
  }

  /**
   * An Update cell of the ALTN panel
   * @param folderId the folder the cell belongs to
   * @param row the ALTN row
   * @param kg the crew's alternate fuel in kg, null to remove it
   * @returns whether the entry was kept; rejected unless this laptop may change the folder (see canEditFollowUp)
   */
  public setAltnFuelUpdate(folderId: string, row: number, kg: number | null): boolean {
    return this.editableFolderOf(folderId)?.setAltnFuelUpdate(row, kg) ?? false;
  }

  /**
   * NEXT WPT of the navigation log of the current folder
   * @param fromKey the initial waypoint
   * @param entry the name of the next waypoint
   * @returns what happened; rejected without the master status
   */
  public nextWaypoint(fromKey: string, entry: string): NextWaypointOutcome {
    return this.editableFolder()?.nextWaypoint(fromKey, entry) ?? 'rejected';
  }

  /**
   * DELETE of a waypoint the crew inserted
   * @param key the row
   * @returns whether it was removed
   */
  public deleteWaypoint(key: string): boolean {
    return this.editableFolder()?.deleteWaypoint(key) ?? false;
  }

  /**
   * @param key a row of the navigation log
   * @param patch the actual values the crew typed
   * @returns whether they were kept
   */
  public setNavLogActual(key: string, patch: Partial<EffNavLogActual>): boolean {
    return this.editableFolder()?.setNavLogActual(key, patch) ?? false;
  }

  /**
   * FUEL CHK
   * @param key the row
   * @returns whether it was checked
   */
  public checkFuel(key: string): boolean {
    return this.editableFolder()?.checkFuel(key) ?? false;
  }

  /**
   * @param text the remarks of the flight report
   * @returns whether they were kept
   */
  public setRemarks(text: string): boolean {
    return this.editableFolder()?.setRemarks(text) ?? false;
  }

  /**
   * The automatic flight follow-up of the current folder: both laptops collect, the master status only decides who may
   * type.
   * @param nowMs the simulation time, unix ms
   * @param avionics what the avionics give the laptop, null when their data do not reach it
   * @returns the collection that was made, null when none was due
   */
  public sampleFollowUp(nowMs: number, avionics: FollowUpAvionics | null): FollowUpSample | null {
    const folder = this.current.get();
    if (folder === null) {
      return null;
    }
    if (folder.id !== this.sampledFolderId) {
      this.followUpSampler.reset();
      this.sampledFolderId = folder.id;
    }
    return folder.sampleFollowUp(this.followUpSampler, nowMs, avionics);
  }

  /**
   * @param timeMs the take-off time, unix ms
   * @param fobKg the fuel on board at take-off, kg
   */
  public recordTakeoff(timeMs: number, fobKg: number | null): void {
    this.current.get()?.recordTakeoff(timeMs, fobKg);
  }

  /** REFRESH: the flight follow-up of the current folder comes from the other laptop */
  public refreshFromOffside(): void {
    const folder = this.current.get();
    if (folder !== null && !folder.closed) {
      this.refreshPending = true;
      this.network.sendRefreshRequest({ sender: this.index, identifier: folder.id });
    }
  }

  /** @param message the other laptop asks for a REFRESH: it gets the follow-up if the folder is current here too */
  public receiveRefreshRequest(message: FlightFolderNetworkEvents['oisEffRefreshRequest']): void {
    const folder = this.current.get();
    if (message.sender !== this.index && folder !== null && folder.id === message.identifier) {
      this.network.sendRefreshReply({ sender: this.index, identifier: folder.id, followUp: folder.followUpState() });
    }
  }

  /** @param message the answer of the other laptop: taken only when this laptop asked for it */
  public receiveRefreshReply(message: FlightFolderNetworkEvents['oisEffRefreshReply']): void {
    const folder = this.current.get();
    if (message.sender === this.index || !this.refreshPending) {
      return;
    }
    this.refreshPending = false;
    if (folder !== null && folder.id === message.identifier) {
      folder.applyFollowUp(message.followUp);
    }
  }

  /** @returns whether the current folder takes a STORE */
  public canStore(): boolean {
    return this._storeAvailable.get();
  }
}
