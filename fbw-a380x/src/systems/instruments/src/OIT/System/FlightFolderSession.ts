// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MappedSubject, Subject, Subscribable } from '@microsoft/msfs-sdk';
import type { ISimbriefData } from '@flybywiresim/fbw-sdk';
import { FlightFolder, EffSyncState } from './FlightFolder';
import { buildFlightFolderTree } from './FlightFolderDocuments';
import { buildFlightPlan } from './FlightFolderFlightPlan';
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
}

/** How a laptop reaches the other laptop */
export interface FlightFolderNetwork {
  sendCurrent(message: FlightFolderNetworkEvents['oisEffCurrent']): void;
  sendMaster(message: FlightFolderNetworkEvents['oisEffMaster']): void;
  sendSynchronize(message: FlightFolderNetworkEvents['oisEffSynchronize']): void;
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

  private readonly _pending = Subject.create<readonly PendingImport[]>([]);
  /** The EFFs loaded and not imported: the import pop-up lists them */
  public readonly pending = this._pending as Subscribable<readonly PendingImport[]>;

  private readonly _isMaster = Subject.create(false);
  /** This laptop is the master of the flight follow-up of the current folder */
  public readonly isMaster = this._isMaster as Subscribable<boolean>;

  private launchStartedMs: number | null = null;

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
  ) {}

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

  /** @returns whether the current folder takes a STORE */
  public canStore(): boolean {
    const folder = this.current.get();
    return folder !== null && !folder.closed;
  }
}
