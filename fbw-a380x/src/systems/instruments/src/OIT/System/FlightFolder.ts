// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject, Subscribable } from '@microsoft/msfs-sdk';
import { EffConstraint, EffDocument, EffNode, PERFORMANCE_FOLDER_ID, RECYCLE_BIN_ID } from './FlightFolderDocuments';
import { EffFlightPlan, EffFuelKey, EffLoadKey } from './FlightFolderFlightPlan';

/** Who signed or checked a document, and when */
export interface EffDone {
  readonly by: string;
  readonly timeMs: number;
}

/** What the crew did with a document of the folder */
export interface EffDocState {
  read: boolean;
  note: string | null;
  done: EffDone | null;
  deleted: boolean;
  /** The active flight plan of the folder */
  selected: boolean;
}

/** blue: a signature or check is still needed, green: done, white: nothing needed */
export type EffColour = 'blue' | 'green' | 'white';

export type EffExported = 'no' | 'cfp' | 'full';

/** The part of a folder the offside laptop takes over with SYNCHRONIZE WITH OFFSIDE */
export interface EffSyncState {
  readonly identifier: string;
  readonly docs: Readonly<Record<string, EffDocState>>;
  readonly updates: EffFlightPlan['updates'];
  /** The pages stored in the folder: the other laptop may not have them */
  readonly stored: readonly { readonly name: string; readonly text: string }[];
}

/**
 * @param state the state of a document
 * @returns a copy
 */
function copyState(state: EffDocState): EffDocState {
  return { ...state, done: state.done ? { ...state.done } : null };
}

/**
 * An electronic flight folder (EFF) on one laptop: the tree of its documents, what the crew did with them and its
 * flight plan. It is read-only (closed) after the full export or the flight closure.
 */
export class FlightFolder {
  private readonly _changed = Subject.create(0);
  /** Counts every change of the folder, for the views to draw again */
  public readonly changed = this._changed as Subscribable<number>;

  private readonly states = new Map<string, EffDocState>();

  private readonly storeCounters = new Map<string, number>();

  private _closed = false;
  private _exported: EffExported = 'no';

  /**
   * @param id the identifier of the flight: flight number, date and city pair
   * @param label the root of the tree
   * @param generatedMs when the OFP was generated, unix ms
   * @param tree the documents of the folder
   * @param flightPlan the flight plan document
   * @param exportIdentifier the DATA IDENTIFIER of its export, in the EXPORT BOX
   */
  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly generatedMs: number | null,
    private tree: readonly EffNode[],
    public readonly flightPlan: EffFlightPlan,
    public readonly exportIdentifier: string,
  ) {
    this.eachDocument(this.tree, (node) => this.states.set(node.id, this.freshState()));
  }

  public get closed(): boolean {
    return this._closed;
  }

  public get exported(): EffExported {
    return this._exported;
  }

  private freshState(): EffDocState {
    return { read: false, note: null, done: null, deleted: false, selected: false };
  }

  private changedNow(): void {
    this._changed.set(this._changed.get() + 1);
  }

  private eachDocument(nodes: readonly EffNode[], visit: (node: EffNode) => void): void {
    for (const node of nodes) {
      if (node.doc) {
        visit(node);
      }
      if (node.children) {
        this.eachDocument(node.children, visit);
      }
    }
  }

  /**
   * @param docId the document
   * @returns the state of a document, a copy
   */
  public state(docId: string): EffDocState | null {
    const state = this.states.get(docId);
    return state ? copyState(state) : null;
  }

  /** @returns the tree as shown: the deleted documents moved to the Recycle Bin, which comes last */
  public visibleTree(): EffNode[] {
    const deleted: EffNode[] = [];
    const prune = (nodes: readonly EffNode[]): EffNode[] =>
      nodes
        .filter((node) => {
          if (node.doc && this.states.get(node.id)?.deleted) {
            deleted.push({ id: node.id, name: node.name, doc: node.doc });
            return false;
          }
          return true;
        })
        .map((node) => (node.children ? { ...node, children: prune(node.children) } : node));
    const kept = prune(this.tree);
    return [...kept, { id: RECYCLE_BIN_ID, name: 'Recycle Bin', children: deleted }];
  }

  /**
   * @param docId a document of the folder, in the tree or in the Recycle Bin
   * @returns the document
   */
  public document(docId: string): EffDocument | null {
    let found: EffDocument | null = null;
    this.eachDocument(this.tree, (node) => {
      if (node.id === docId) {
        found = node.doc ?? null;
      }
    });
    return found;
  }

  /**
   * @param docId a document of the folder
   * @returns its name
   */
  public documentName(docId: string): string {
    let name = '';
    this.eachDocument(this.tree, (node) => {
      if (node.id === docId) {
        name = node.name;
      }
    });
    return name;
  }

  /** @returns the documents out of the Recycle Bin in tree order: the order of << and >> */
  public documentOrder(): string[] {
    const order: string[] = [];
    this.eachDocument(
      this.visibleTree().filter((node) => node.id !== RECYCLE_BIN_ID),
      (node) => order.push(node.id),
    );
    return order;
  }

  /**
   * @param fromDocId the document shown, null when a folder is shown
   * @param step -1 for <<, 1 for >>
   * @returns the document to show, null when there is none that way
   */
  public neighbour(fromDocId: string | null, step: -1 | 1): string | null {
    const order = this.documentOrder();
    if (order.length === 0) {
      return null;
    }
    const index = fromDocId === null ? -1 : order.indexOf(fromDocId);
    if (index < 0) {
      return step === 1 ? order[0] : null;
    }
    return order[index + step] ?? null;
  }

  /**
   * @param node a node of the tree
   * @returns its colour: the signatures and checks a document needs, a folder takes the worst of its documents
   */
  public colourOf(node: EffNode): EffColour {
    if (node.id === RECYCLE_BIN_ID) {
      return 'white';
    }
    if (node.doc) {
      return this.docColour(node.id, node.doc.constraint);
    }
    let colour: EffColour = 'white';
    for (const child of node.children ?? []) {
      const childColour = this.colourOf(child);
      if (childColour === 'blue') {
        return 'blue';
      }
      if (childColour === 'green') {
        colour = 'green';
      }
    }
    return colour;
  }

  private docColour(docId: string, constraint: EffConstraint): EffColour {
    if (constraint === 'none') {
      return 'white';
    }
    return this.states.get(docId)?.done ? 'green' : 'blue';
  }

  /**
   * @param node a node of the tree
   * @returns whether it is a document not read yet, or a folder holding one
   */
  public isNew(node: EffNode): boolean {
    if (node.id === RECYCLE_BIN_ID) {
      return false;
    }
    if (node.doc) {
      const state = this.states.get(node.id);
      return state !== undefined && !state.read && !state.deleted;
    }
    return (node.children ?? []).some((child) => this.isNew(child));
  }

  /** @param docId the document displayed: it is read, which removes its (NEW) */
  public markRead(docId: string): void {
    const state = this.states.get(docId);
    if (state && !state.read) {
      state.read = true;
      this.changedNow();
    }
  }

  /**
   * @param docId a document
   * @param note the note, null or empty to remove it
   * @returns whether the note was kept
   */
  public setNote(docId: string, note: string | null): boolean {
    const state = this.states.get(docId);
    if (!state || this._closed) {
      return false;
    }
    state.note = note !== null && note.trim() !== '' ? note : null;
    this.changedNow();
    return true;
  }

  /**
   * SIGN / CHECK toggle: a document that needs one gets the person's id, the same button again withdraws it
   * @param docId a document
   * @param personalId who signs or checks
   * @param timeMs the time, unix ms
   * @returns whether the document changed
   */
  public toggleDone(docId: string, personalId: string, timeMs: number): boolean {
    const state = this.states.get(docId);
    const doc = this.document(docId);
    if (!state || !doc || doc.constraint === 'none' || state.deleted || this._closed) {
      return false;
    }
    state.done = state.done ? null : { by: personalId, timeMs };
    this.changedNow();
    return true;
  }

  /**
   * DELETE: the document goes to the Recycle Bin
   * @param docId a document
   * @returns whether it moved
   */
  public deleteDocument(docId: string): boolean {
    const state = this.states.get(docId);
    if (!state || state.deleted || this._closed) {
      return false;
    }
    state.deleted = true;
    state.selected = false;
    this.changedNow();
    return true;
  }

  /**
   * SELECT: the flight plan becomes the active one, the folder has one active plan
   * @param docId a flight plan document
   * @returns whether it was selected
   */
  public selectPlan(docId: string): boolean {
    if (this.document(docId)?.kind !== 'flight-plan' || this._closed || this.states.get(docId)?.deleted) {
      return false;
    }
    this.states.forEach((state, id) => {
      state.selected = id === docId;
    });
    this.changedNow();
    return true;
  }

  /** @returns the active flight plan, null when none is selected */
  public selectedPlan(): string | null {
    let selected: string | null = null;
    this.states.forEach((state, id) => {
      if (state.selected) {
        selected = id;
      }
    });
    return selected;
  }

  /**
   * STORE: an application's page is kept in the folder as a document of the Performance folder, not read yet
   * @param code the application code, e.g. TOPA
   * @param text the page as text
   * @returns the name of the document, null when the folder is closed
   */
  public store(code: string, text: string): string | null {
    if (this._closed) {
      return null;
    }
    const count = (this.storeCounters.get(code) ?? 0) + 1;
    const name = `${code}_${count}`;
    this.addStoredDocument(code, count, text);
    this.changedNow();
    return name;
  }

  private addStoredDocument(code: string, count: number, text: string): void {
    this.storeCounters.set(code, Math.max(count, this.storeCounters.get(code) ?? 0));
    const name = `${code}_${count}`;
    const node: EffNode = {
      id: `${PERFORMANCE_FOLDER_ID}/${name}`,
      name,
      doc: { kind: 'text', text, constraint: 'none', exportBeforePushBack: false },
    };
    const existing = this.tree.find((n) => n.id === PERFORMANCE_FOLDER_ID);
    this.tree = existing
      ? this.tree.map((n) => (n === existing ? { ...n, children: [...(n.children ?? []), node] } : n))
      : [...this.tree, { id: PERFORMANCE_FOLDER_ID, name: 'Performance', children: [node] }];
    this.states.set(node.id, this.freshState());
  }

  /**
   * @param kind the export
   * @returns the documents the export holds, each with the folders it is in: the ones for the export before push back,
   * or all of them
   */
  public exportContent(kind: 'cfp' | 'full'): string[] {
    const names: string[] = [];
    const visit = (nodes: readonly EffNode[], path: string): void => {
      for (const node of nodes) {
        if (node.doc && (kind === 'full' || node.doc.exportBeforePushBack)) {
          names.push(`${path}${node.name}`);
        }
        visit(node.children ?? [], node.children ? `${path}${node.name} / ` : path);
      }
    };
    visit(
      this.visibleTree().filter((node) => node.id !== RECYCLE_BIN_ID),
      '',
    );
    return names;
  }

  /**
   * The export is done: the full one closes the folder, the one before push back keeps it open
   * @param kind the export
   */
  public markExported(kind: 'cfp' | 'full'): void {
    this._exported = kind;
    if (kind === 'full') {
      this._closed = true;
    }
    this.changedNow();
  }

  /** FLIGHT CLOSURE: the folder is closed without an export */
  public close(): void {
    this._closed = true;
    this.changedNow();
  }

  /**
   * @param key a fuel line of the flight plan
   * @param kg the crew's entry in kg, null to remove it
   * @returns whether the entry was kept
   */
  public setFuelUpdate(key: EffFuelKey, kg: number | null): boolean {
    if (this._closed) {
      return false;
    }
    if (kg === null) {
      delete this.flightPlan.updates.fuel[key];
    } else {
      this.flightPlan.updates.fuel[key] = kg;
    }
    this.changedNow();
    return true;
  }

  /**
   * @param key a load line of the flight plan
   * @param kg the crew's entry in kg, null to remove it
   * @returns whether the entry was kept
   */
  public setLoadUpdate(key: EffLoadKey, kg: number | null): boolean {
    if (this._closed) {
      return false;
    }
    if (kg === null) {
      delete this.flightPlan.updates.load[key];
    } else {
      this.flightPlan.updates.load[key] = kg;
    }
    this.changedNow();
    return true;
  }

  /**
   * @param row the ALTN row
   * @param kg the crew's alternate fuel in kg, null to remove it
   * @returns whether the entry was kept
   */
  public setAltnFuelUpdate(row: number, kg: number | null): boolean {
    if (this._closed) {
      return false;
    }
    this.flightPlan.updates.altnFuel[row] = kg === null ? undefined : kg;
    this.changedNow();
    return true;
  }

  /** @returns what SYNCHRONIZE WITH OFFSIDE sends to the other laptop */
  public syncState(): EffSyncState {
    const docs: Record<string, EffDocState> = {};
    this.states.forEach((state, id) => {
      docs[id] = copyState(state);
    });
    const updates = this.flightPlan.updates;
    const stored = (this.tree.find((n) => n.id === PERFORMANCE_FOLDER_ID)?.children ?? []).map((n) => ({
      name: n.name,
      text: n.doc?.text ?? '',
    }));
    return {
      identifier: this.id,
      stored,
      docs,
      updates: { fuel: { ...updates.fuel }, load: { ...updates.load }, altnFuel: updates.altnFuel.slice() },
    };
  }

  /**
   * @param sync what the other laptop sent for the same folder
   * @returns whether it was taken: not by a closed folder or another flight
   */
  public applySyncState(sync: EffSyncState): boolean {
    if (sync.identifier !== this.id || this._closed) {
      return false;
    }
    for (const page of sync.stored) {
      const separator = page.name.lastIndexOf('_');
      const code = page.name.substring(0, separator);
      const count = Number(page.name.substring(separator + 1));
      if (!this.states.has(`${PERFORMANCE_FOLDER_ID}/${page.name}`) && code !== '' && count > 0) {
        this.addStoredDocument(code, count, page.text);
      }
    }
    Object.keys(sync.docs).forEach((id) => {
      const local = this.states.get(id);
      if (local) {
        // A document read on either laptop is read: the other laptop may not have shown it yet
        this.states.set(id, { ...copyState(sync.docs[id]), read: local.read || sync.docs[id].read });
      }
    });
    this.flightPlan.updates.fuel = { ...sync.updates.fuel };
    this.flightPlan.updates.load = { ...sync.updates.load };
    this.flightPlan.updates.altnFuel = sync.updates.altnFuel.slice();
    this.changedNow();
    return true;
  }
}
