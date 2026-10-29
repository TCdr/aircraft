// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MappedSubject, Subject, Subscribable } from '@microsoft/msfs-sdk';
import { ChecklistState } from '../../../MsfsAvionicsCommon/providers/FwsPublisher';
import { DocumentTreeMode, DocumentTreeRow } from '../../Pages/FltOps/Shared/DocumentTree';
import { SearchQuery } from '../../Pages/FltOps/Shared/DocumentSearch';
import { OPS_LAYERS, OpsLayer, OpsLibraryCatalog, OpsNode } from './OpsLibraryContent';
import { OpsLibraryUserData } from './OpsLibraryUserData';

const DEFAULT_LAYER: OpsLayer = 2;

/** A search shown in the consultation tree: the units found are green and the words are highlighted */
export interface ConsultationSearch {
  readonly query: SearchQuery | null;
  /** The ids of the units found and their parents */
  readonly hits: ReadonlySet<string>;
}

/**
 * The consultation of a manual: the open manual and node, the history of the ◄ ► buttons, the layer, the tree mode
 * and the search shown in the tree. It belongs to the laptop, so that a page left with the switching bar and shown again
 * is where the crew left it.
 */
export class OpsLibraryConsultation {
  private readonly _manualId = Subject.create<string | null>(null);
  /** The open manual, null on the home page */
  public readonly manualId = this._manualId as Subscribable<string | null>;

  private readonly _nodeId = Subject.create<string | null>(null);
  /** The selected node of the tree: a unit, or a folder whose contents are listed */
  public readonly nodeId = this._nodeId as Subscribable<string | null>;

  /** Design choice: the layer starts at 2: the paragraphs of the manuals are layer 2, so a unit shows its text */
  public readonly layer = Subject.create<OpsLayer>(DEFAULT_LAYER);

  public readonly treeMode = Subject.create<DocumentTreeMode>('path');

  public readonly treeHidden = Subject.create(false);

  public readonly noteShown = Subject.create(false);

  /** The search area of the toolbar SEARCH button is open */
  public readonly searchAreaShown = Subject.create(false);

  /** The procedure states of ECAM alerts opened from the ECAM ALERTS tab: the procedure as it ran */
  private procedureStates = new Map<string, ChecklistState>();

  private readonly _search = Subject.create<ConsultationSearch | null>(null);
  public readonly search = this._search as Subscribable<ConsultationSearch | null>;

  private readonly expanded = Subject.create<ReadonlySet<string>>(new Set());

  private history: string[] = [];

  private position = -1;

  private readonly _canGoBack = Subject.create(false);
  public readonly canGoBack = this._canGoBack as Subscribable<boolean>;

  private readonly _canGoForward = Subject.create(false);
  public readonly canGoForward = this._canGoForward as Subscribable<boolean>;

  /** The lines of the navigation tree of the open manual; it lives as long as the laptop session, so it is never destroyed */
  public readonly rows: Subscribable<readonly DocumentTreeRow[]>;

  constructor(
    private readonly catalog: OpsLibraryCatalog,
    private readonly userData: OpsLibraryUserData,
  ) {
    this.rows = MappedSubject.create(
      ([manualId, nodeId, mode, expanded, search]) => {
        const index = manualId !== null ? this.catalog.index(manualId) : undefined;
        if (index === undefined) {
          return [];
        }
        return index.rows({
          mode,
          expanded,
          selectedId: nodeId,
          hits: search?.hits,
          notes: new Set(this.userData.notes.unitIds()),
        });
      },
      this._manualId,
      this._nodeId,
      this.treeMode,
      this.expanded,
      this._search,
      this.userData.notesVersion,
    );
  }

  /** @returns the open node, undefined when none or when it no longer exists */
  public openNode(): OpsNode | undefined {
    const id = this._nodeId.get();
    return id !== null ? this.catalog.find(id)?.unit : undefined;
  }

  /**
   * Opens a manual at a node (a hit of a search, a bookmark, a link) or at its first page.
   * @param manualId the manual
   * @param nodeId the node, the root of the manual by default
   */
  public open(manualId: string, nodeId?: string): void {
    const index = this.catalog.index(manualId);
    if (index === undefined) {
      return;
    }
    if (this._manualId.get() !== manualId) {
      this.expanded.set(new Set());
      this._search.set(null);
    }
    this._manualId.set(manualId);
    this.goTo(nodeId !== undefined && index.has(nodeId) ? nodeId : index.root.id, true);
  }

  /**
   * @param unitId an ECAM PROCEDURES unit
   * @returns the state of the procedure as it ran when the unit was opened from an alert, null for the plain procedure
   */
  public procedureStateOf(unitId: string): ChecklistState | null {
    return this.procedureStates.get(unitId) ?? null;
  }

  /**
   * Opens the procedure of an alert as it ran (the SEARCH link of the ECAM ALERTS tab).
   * @param unitId the ECAM PROCEDURES unit
   * @param state the last state of the procedure, null for the plain procedure
   */
  public openProcedure(unitId: string, state: ChecklistState | null): void {
    if (state === null) {
      this.procedureStates.delete(unitId);
    } else {
      this.procedureStates.set(unitId, state);
    }
    this.openUnit(unitId);
  }

  /**
   * Opens a unit of any manual, e.g. a bookmark.
   * @param unitId the unit id
   * @returns whether a manual has the unit
   */
  public openUnit(unitId: string): boolean {
    const found = this.catalog.find(unitId);
    if (found === undefined) {
      return false;
    }
    this.open(found.manualId, unitId);
    return true;
  }

  /**
   * A line of the tree was clicked: a unit opens, a folder lists its contents
   * @param nodeId the clicked node
   */
  public select(nodeId: string): void {
    this.goTo(nodeId, true);
  }

  /**
   * The + or - icon of a folder
   * @param folderId the folder
   */
  public toggleFolder(folderId: string): void {
    const next = new Set(this.expanded.get());
    if (next.has(folderId)) {
      next.delete(folderId);
    } else {
      next.add(folderId);
    }
    this.expanded.set(next);
  }

  /** ◄ of the toolbar */
  public back(): void {
    if (this.position > 0) {
      this.position--;
      this.goTo(this.history[this.position], false);
    }
  }

  /** ► of the toolbar */
  public forward(): void {
    if (this.position < this.history.length - 1) {
      this.position++;
      this.goTo(this.history[this.position], false);
    }
  }

  /** >> of the toolbar: the next unit in the tree order */
  public nextUnit(): void {
    this.stepUnit(1);
  }

  /** << of the toolbar */
  public previousUnit(): void {
    this.stepUnit(-1);
  }

  public hasNextUnit(): boolean {
    return this.neighbour(1) !== null;
  }

  public hasPreviousUnit(): boolean {
    return this.neighbour(-1) !== null;
  }

  /**
   * Shows the hits of a search in the tree and highlights its words in the units
   * @param search the query and the hits
   */
  public showSearch(search: ConsultationSearch): void {
    this._search.set(search);
  }

  /**
   * Shows the hits of a search that are in the open manual: green in the tree, the words highlighted in the units.
   * @param hits the hits of the search, of any manual
   * @param query the search that found them
   * @returns the number of hits in the open manual
   */
  public showSearchHitsInManual(hits: readonly { id: string }[], query: SearchQuery): number {
    const manualId = this._manualId.get();
    const index = manualId !== null ? this.catalog.index(manualId) : undefined;
    if (index === undefined) {
      return 0;
    }
    const inManual = hits.filter((hit) => this.catalog.find(hit.id)?.manualId === manualId).map((hit) => hit.id);
    this._search.set({ query, hits: index.hitSet(inManual) });
    return inManual.length;
  }

  /** The × of the search area */
  public closeSearch(): void {
    this._search.set(null);
  }

  public setLayer(layer: OpsLayer): void {
    if (OPS_LAYERS.includes(layer)) {
      this.layer.set(layer);
    }
  }

  /** CLOSE APPLICATION or HOME: the unit open now is where the Interruption folder resumes */
  public close(): void {
    const unit = this.openNode();
    if (unit !== undefined && unit.kind === 'unit') {
      this.userData.setInterruption(unit.id);
    }
    this._manualId.set(null);
    this._nodeId.set(null);
    this._search.set(null);
    this.noteShown.set(false);
    this.searchAreaShown.set(false);
  }

  /** The laptop starts again: nothing stays open */
  public reset(): void {
    this._manualId.set(null);
    this._nodeId.set(null);
    this._search.set(null);
    this.noteShown.set(false);
    this.searchAreaShown.set(false);
    this.procedureStates = new Map();
    this.expanded.set(new Set());
    this.history = [];
    this.position = -1;
    this.updateHistoryFlags();
    this.layer.set(DEFAULT_LAYER);
    this.treeMode.set('path');
    this.treeHidden.set(false);
  }

  private goTo(nodeId: string, record: boolean): void {
    const found = this.catalog.find(nodeId);
    if (found === undefined) {
      return;
    }
    if (this._manualId.get() !== found.manualId) {
      this._manualId.set(found.manualId);
    }
    this._nodeId.set(nodeId);
    if (found.unit.kind === 'unit') {
      this.userData.recordVisit(nodeId);
    }
    if (record && this.history[this.position] !== nodeId) {
      this.history = [...this.history.slice(0, this.position + 1), nodeId];
      this.position = this.history.length - 1;
    }
    this.updateHistoryFlags();
  }

  private updateHistoryFlags(): void {
    this._canGoBack.set(this.position > 0);
    this._canGoForward.set(this.position < this.history.length - 1);
  }

  private neighbour(step: 1 | -1): OpsNode | null {
    const manualId = this._manualId.get();
    const nodeId = this._nodeId.get();
    const index = manualId !== null ? this.catalog.index(manualId) : undefined;
    if (index === undefined || nodeId === null) {
      return null;
    }
    const current = index.node(nodeId);
    if (current === undefined) {
      return null;
    }
    if (current.kind === 'unit') {
      return (step === 1 ? index.nextUnit(nodeId) : index.previousUnit(nodeId)) as OpsNode | null;
    }
    // From a folder the next unit is its first one, the previous unit the one before it
    const first = index.firstUnitOf(nodeId);
    if (first === null) {
      return null;
    }
    return (step === 1 ? first : index.previousUnit(first.id)) as OpsNode | null;
  }

  private stepUnit(step: 1 | -1): void {
    const unit = this.neighbour(step);
    if (unit !== null) {
      this.goTo(unit.id, true);
    }
  }
}
