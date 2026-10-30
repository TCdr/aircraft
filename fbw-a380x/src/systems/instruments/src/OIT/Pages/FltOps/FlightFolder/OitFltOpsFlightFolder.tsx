//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  ClockEvents,
  DisplayComponent,
  FSComponent,
  MappedSubject,
  Subject,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';
import { NXUnits } from '@flybywiresim/fbw-sdk';
import { A380AocPrintEvents } from '@shared/AocPrintout';
import { AbstractOitFltOpsPageProps } from '../../../OIT';
import { Button, ButtonMenuItem } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { FlightFolder } from '../../../System/FlightFolder';
import { RECYCLE_BIN_ID } from '../../../System/FlightFolderDocuments';
import { flightPlanPrintText, lastFlownLineIndex, navLogLines } from '../../../System/FlightFolderFlightPlan';
import {
  EffTreeRow,
  FLIGHT_FOLDER_ROOT_ID,
  flightFolderTreeRows,
  folderListing,
  selectedDocumentId,
} from '../../../System/FlightFolderTreeRows';
import { findOccurrences, occurrencesText, stepOccurrence } from '../../../System/FlightFolderTextSearch';
import { OisDialog } from '../../../System/OisDialog';
import { oisDateMixedCase, oisTime } from '../../../System/OisDateTime';
import { FLT_FOLDER_URI } from '../FltOpsApplications';
import { OisIdentificationDialog } from '../../Common/OisIdentificationDialog';
import { PaneScope, PaneRule } from '../Shared/PaneLayout';
import { DocumentNoteField } from '../Shared/DocumentNoteField';
import { DocumentNotes } from '../Shared/DocumentNotes';
import { DocumentTextEntry } from '../Shared/DocumentTextEntry';
import { DocumentTextField } from '../Shared/DocumentTextField';
import { DocumentTreeRow, unitIdOfNoteRow } from '../Shared/DocumentTree';
import { DocumentTreeView } from '../Shared/DocumentTreeView';
import { OitFlightPlanPanels } from './OitFlightPlanPanels';
import { OitFlightFolderExport } from './OitFlightFolderExport';
import { NavLogRowMenu } from './NavLogRowMenu';
import { NavLogActions } from './OitNavLogPanel';
import { NextWaypointRequest, OitNavLogNextWaypoint } from './OitNavLogNextWaypoint';
import './flight-folder.scss';

/**
 * The panes with an explicit height, outermost first: the page never depends on the browser shrinking flex items, so a
 * long document cannot push the buttons off the screen.
 */
const FOLDER_PANE_RULES: PaneRule[] = [
  { selector: '.oit-eff-app', rule: 'to-page-bottom' },
  { selector: '.oit-eff-main', rule: 'fill' },
  { selector: '.oit-eff-tree', rule: 'same' },
  { selector: '.oit-eff-tree .oit-doc-tree', rule: 'same' },
  { selector: '.oit-eff-document', rule: 'same' },
  { selector: '.oit-eff-content', rule: 'fill' },
];

/** The panes that scroll, with the click-operated scroll bar */
const FOLDER_SCROLLERS = ['.oit-eff-content', '.oit-eff-tree .oit-doc-tree'];

/** The start-up window of the application, ms. */
export const FLIGHT_FOLDER_LAUNCH_MS = 50_000;

/** The entries of the page that outlive a drawing of it: the crew leaves the application and comes back */
const DRAFTS = FLT_FOLDER_URI;
const DIALOG_DRAFTS = `${FLT_FOLDER_URI}/dialog`;

/** The longest search text. Design choice: one short line in an entry field */
const SEARCH_MAX_LENGTH = 40;

interface OitFltOpsFlightFolderProps extends AbstractOitFltOpsPageProps {}

/**
 * The FLT FOLDER: the electronic flight folders loaded from the LOAD BOX, their navigation tree and documents, the
 * flight plan panels and the export.
 */
export class OitFltOpsFlightFolder extends DisplayComponent<OitFltOpsFlightFolderProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  private readonly laptop = this.props.container.laptop;
  private readonly session = this.laptop.flightFolder;
  private readonly drafts = this.laptop.pageDrafts;
  private readonly captOrFo = this.props.uiService.captOrFo;

  // What the crew selected, kept while the application stays open
  private readonly shownId = this.drafts.field<string | null>(DRAFTS, 'shownId', null);
  private readonly view = this.drafts.field<'folder' | 'export'>(DRAFTS, 'view', 'folder');
  private readonly treeHidden = this.drafts.field(DRAFTS, 'treeHidden', false);
  private readonly selectedNode = this.drafts.field<string | null>(DRAFTS, 'selectedNode', null);
  private readonly expanded = this.drafts.field<ReadonlySet<string>>(DRAFTS, 'expanded', new Set<string>());
  private readonly planTab = this.drafts.field(DRAFTS, 'planTab', 'FMS INIT');
  private readonly noteOpen = this.drafts.field(DRAFTS, 'noteOpen', false);
  private readonly searchOpen = this.drafts.field(DRAFTS, 'searchOpen', false);
  private readonly searchText = this.drafts.field<string | null>(DRAFTS, 'searchText', null);

  /** The notes of the displayed folder, kept in the folder itself (they travel to the other laptop with it) */
  private readonly notes = new DocumentNotes((unitId, text) => this.folder()?.setNote(unitId, text));
  /** The document the note field edits */
  private readonly noteUnit = Subject.create<string | null>(null);
  private readonly appRef = FSComponent.createRef<HTMLDivElement>();
  private paneScope: PaneScope | null = null;
  private readonly treeRows = Subject.create<readonly EffTreeRow[]>([]);
  private readonly searchEntry = new DocumentTextEntry((text) => this.searchTyped(text));
  private readonly currentOccurrence = Subject.create<number | null>(null);
  private readonly dialog = Subject.create<OisDialog | null>(null);
  private readonly nextWaypointRequest = Subject.create<NextWaypointRequest | null>(null);
  private readonly nextWaypointRef = FSComponent.createRef<OitNavLogNextWaypoint>();
  private rowMenu: NavLogRowMenu | null = null;
  /** Counts the clicks on FLOWN WPT, which the flight plan panels follow */
  private readonly flownRequest = Subject.create(0);

  private readonly navLogActions: NavLogActions = {
    menu: (anchor, items) => this.rowMenu?.open(anchor, items),
    nextWaypoint: (fromKey, fromIdent) => {
      const folder = this.folder();
      if (folder === null) {
        return;
      }
      const lines = navLogLines(folder.flightPlan);
      const from = lines.findIndex((line) => line.key === fromKey);
      this.nextWaypointRequest.set({
        folderId: folder.id,
        fromKey,
        fromIdent,
        choices: lines.slice(from + 1).map((line) => line.ident),
      });
    },
    confirmDelete: (key, ident) => {
      const folderId = this.folder()?.id;
      this.dialog.set({
        kind: 'Information',
        lines: [`Delete waypoint ${ident} ?`],
        buttons: [
          {
            label: 'OK',
            action: () => {
              if (folderId !== undefined && this.session.canEditFollowUp(folderId)) {
                this.session.deleteWaypoint(key);
              }
            },
          },
          { label: 'CANCEL' },
        ],
      });
    },
  };

  // Skeleton references
  private readonly contentRef = FSComponent.createRef<HTMLDivElement>();
  private readonly tabsHostRef = FSComponent.createRef<HTMLDivElement>();
  private readonly headerHostRef = FSComponent.createRef<HTMLDivElement>();
  private readonly exportRef = FSComponent.createRef<HTMLDivElement>();
  private readonly progressRef = FSComponent.createRef<HTMLDivElement>();

  // Button states, set by refresh()
  private readonly listLabel = Subject.create('');
  private readonly listMenu = Subject.create<ButtonMenuItem[]>([]);
  private readonly manageMenu = Subject.create<ButtonMenuItem[]>([]);
  private readonly treeLabel = this.treeHidden.map((hidden) => (hidden ? 'SHOW TREE' : 'HIDE TREE'));
  private readonly masterLabel = this.session.isMaster.map((master) => (master ? 'MASTER' : 'GET MASTER'));
  private readonly masterDisabled = MappedSubject.create(
    ([master, current]) => master || current === null || current.closed,
    this.session.isMaster,
    this.session.current,
  );
  private readonly standaloneHidden = this.laptop.standalone.map((standalone) => !standalone);
  private readonly previousDisabled = Subject.create(true);
  private readonly nextDisabled = Subject.create(true);
  private readonly deleteDisabled = Subject.create(true);
  private readonly noteLabel = Subject.create('NOTE');
  private readonly noteDisabled = Subject.create(true);
  private readonly searchLabel = Subject.create('SEARCH');
  private readonly searchDisabled = Subject.create(true);
  private readonly selectLabel = Subject.create('SELECT');
  private readonly selectDisabled = Subject.create(true);
  private readonly selectIsOn = Subject.create(false);
  private readonly signLabel = Subject.create('SIGN');
  private readonly planButtonsHidden = Subject.create(true);
  private readonly refreshDisabled = Subject.create(true);
  private readonly flownDisabled = Subject.create(true);
  private readonly signHidden = Subject.create(true);
  private readonly signIsOn = Subject.create(false);
  private readonly docTitle = Subject.create('');
  private readonly occurrenceLine = Subject.create('');
  private readonly launching = Subject.create(false);
  private readonly launchHidden = this.launching.map((launching) => !launching);
  private readonly signVisible = this.signHidden.map((hidden) => !hidden);
  private readonly printAvailable = Subject.create(false);
  private readonly exportHidden = this.view.map((view) => view !== 'export');
  /** The text of the search field as it is typed, before it is validated */
  private searchLive = this.searchText.get() ?? '';

  private readonly mainHidden = this.view.map((view) => view === 'export');
  private readonly folderViewOnly = this.view.map((view) => view !== 'folder');
  private readonly noteHidden = MappedSubject.create(
    ([open, disabled]) => !open || disabled,
    this.noteOpen,
    this.noteDisabled,
  );
  private readonly searchHidden = MappedSubject.create(
    ([open, disabled]) => !open || disabled,
    this.searchOpen,
    this.searchDisabled,
  );

  private content: VNode | null = null;
  private exportView: VNode | null = null;
  private exportFolderId: string | null = null;
  private folderSubscription: Subscription | null = null;
  private lastFolder: FlightFolder | null = null;

  private readonly metric = NXUnits.metricWeight;

  /** @returns the folder shown: the one picked in the list, else the current one */
  private folder(): FlightFolder | null {
    const folders = this.session.folders.get();
    const picked = folders.find((folder) => folder.id === this.shownId.get());
    return picked ?? this.session.current.get();
  }

  private selectedDoc(folder: FlightFolder): string | null {
    return selectedDocumentId(folder, this.selectedNode.get());
  }

  // --- start-up and import -------------------------------------------------------------------------------------

  private startUp(): void {
    if (this.session.launchElapsedMs(Date.now()) >= FLIGHT_FOLDER_LAUNCH_MS) {
      this.launchDone();
      return;
    }
    this.launching.set(true);
    this.subs.push(
      this.props.bus
        .getSubscriber<ClockEvents>()
        .on('realTime')
        .handle(() => {
          if (!this.launching.get()) {
            return;
          }
          const progress = Math.min(1, this.session.launchElapsedMs(Date.now()) / FLIGHT_FOLDER_LAUNCH_MS);
          this.progressRef.instance.style.width = `${Math.round(progress * 100)}%`;
          if (progress >= 1) {
            this.launching.set(false);
            this.launchDone();
          }
        }),
    );
  }

  private launchDone(): void {
    this.launching.set(false);
    this.offerPendingImports();
  }

  /** The data loaded and not imported yet is offered at the start of the application and when it comes forward */
  private offerPendingImports(): void {
    const pending = this.session.pending.get();
    if (pending.length === 0 || this.launching.get() || this.dialog.get() !== null) {
      return;
    }
    const lines = ['LOADED FLT FOLDER data:'];
    for (const item of pending) {
      const generated =
        item.generatedMs !== null ? ` ${oisDateMixedCase(item.generatedMs)} ${oisTime(item.generatedMs)}` : '';
      lines.push(`${item.label} ${item.typeText}${generated}`);
    }
    const ids = pending.map((item) => item.id);
    this.dialog.set({
      kind: 'Information',
      lines,
      buttons: [
        { label: 'DISPLAY AS CURRENT', action: () => this.importPending(ids, true) },
        { label: 'DISPLAY', action: () => this.importPending(ids, false) },
        { label: 'CANCEL' },
      ],
    });
  }

  private importPending(ids: readonly string[], asCurrent: boolean): void {
    const imported = this.session.importPending(ids, asCurrent);
    if (imported.length > 0) {
      this.shownId.set(imported[0].id);
      this.selectedNode.set(FLIGHT_FOLDER_ROOT_ID);
      this.view.set('folder');
    }
    this.refresh();
  }

  private information(lines: string[]): void {
    this.dialog.set({ kind: 'Information', lines, buttons: [{ label: 'OK' }] });
  }

  // --- selection and actions -----------------------------------------------------------------------------------

  private selectNode(id: string): void {
    const folder = this.folder();
    if (folder === null) {
      return;
    }
    this.selectedNode.set(id);
    this.noteOpen.set(unitIsNote(id));
    this.currentOccurrence.set(null);
    const doc = this.selectedDoc(folder);
    if (doc !== null) {
      folder.markRead(doc);
    }
    this.refresh();
  }

  private toggleExpanded(id: string): void {
    const next = new Set(this.expanded.get());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.expanded.set(next);
    this.refresh();
  }

  private step(step: -1 | 1): void {
    const folder = this.folder();
    if (folder === null) {
      return;
    }
    const target = folder.neighbour(this.selectedDoc(folder), step);
    if (target !== null) {
      this.selectNode(target);
    }
  }

  private deleteDisplayed(): void {
    const folder = this.folder();
    const doc = folder !== null ? this.selectedDoc(folder) : null;
    if (folder === null || doc === null) {
      return;
    }
    folder.deleteDocument(doc);
    this.selectNode(RECYCLE_BIN_ID);
  }

  private toggleNote(): void {
    this.noteOpen.set(!this.noteOpen.get());
    this.refresh();
  }

  private noteChanged(): void {
    const folder = this.folder();
    const doc = folder !== null ? this.selectedDoc(folder) : null;
    this.noteOpen.set(false);
    if (doc !== null && unitIsNote(this.selectedNode.get())) {
      this.selectedNode.set(doc);
    }
    this.refresh();
  }

  private toggleSearch(): void {
    this.searchOpen.set(!this.searchOpen.get());
    this.currentOccurrence.set(null);
    this.refresh();
  }

  private searchTyped(text: string): void {
    this.searchLive = text;
    this.searchText.set(text === '' ? null : text);
    this.currentOccurrence.set(null);
    this.renderContent();
  }

  private stepSearch(step: -1 | 1): void {
    const folder = this.folder();
    const doc = folder !== null ? this.selectedDoc(folder) : null;
    const text = doc !== null ? folder?.document(doc)?.text ?? '' : '';
    const count = findOccurrences(text, this.searchLive).length;
    this.currentOccurrence.set(stepOccurrence(this.currentOccurrence.get(), count, step));
    this.renderContent();
  }

  private selectPlan(): void {
    const folder = this.folder();
    const doc = folder !== null ? this.selectedDoc(folder) : null;
    if (folder !== null && doc !== null) {
      folder.selectPlan(doc);
    }
  }

  /** SIGN or CHECK: the crew identifies first, withdrawing the signature needs no identification */
  private toggleDone(): void {
    const folder = this.folder();
    const doc = folder !== null ? this.selectedDoc(folder) : null;
    if (folder === null || doc === null) {
      return;
    }
    const constraint = folder.document(doc)?.constraint;
    if (folder.state(doc)?.done) {
      folder.toggleDone(doc, '', this.laptop.simTimeMs());
      return;
    }
    const personalId = this.drafts.field<string | null>(DIALOG_DRAFTS, 'personalId', null);
    this.dialog.set({
      kind: 'Information',
      lines: [constraint === 'check' ? 'Document check' : 'Electronic signature'],
      identification: 'signature',
      buttons: [
        { label: 'OK', action: () => folder.toggleDone(doc, personalId.get() ?? '', this.laptop.simTimeMs()) },
        { label: 'CANCEL' },
      ],
    });
  }

  private print(): void {
    const folder = this.folder();
    const doc = folder !== null ? this.selectedDoc(folder) : null;
    const docNode = folder !== null && doc !== null ? folder.document(doc) : null;
    if (folder === null || doc === null || docNode === null) {
      return;
    }
    const text = docNode.kind === 'flight-plan' ? flightPlanPrintText(folder.flightPlan, this.metric) : docNode.text;
    this.props.bus
      .getPublisher<A380AocPrintEvents>()
      .pub('aocPrintMessage', { text, title: folder.documentName(doc) }, true, false);
  }

  // --- MANAGE ---------------------------------------------------------------------------------------------------

  private manageItems(folder: FlightFolder | null): ButtonMenuItem[] {
    const current = this.session.current.get();
    const currentOpen = current !== null && !current.closed;
    return [
      { label: 'IMPORT FLT FOLDER', action: () => this.importFromMenu() },
      {
        label: 'SET FLT FOLDER AS CURRENT',
        disabled: folder === null || folder === current,
        action: () => this.askSetCurrent(folder),
      },
      { label: 'EXPORT FLIGHT FOLDER', disabled: !currentOpen, action: () => this.view.set('export') },
      { label: 'FLIGHT CLOSURE', disabled: !currentOpen, action: () => this.askClosure() },
      {
        label: 'SYNCHRONIZE WITH OFFSIDE',
        disabled: this.laptop.standalone.get() || current === null,
        action: () => this.session.synchronize(),
      },
      { label: 'ADMINISTRATOR FUNCTIONS', action: () => this.administrator() },
    ];
  }

  private importFromMenu(): void {
    if (this.session.pending.get().length === 0) {
      this.information(['No data to import.', 'Load a FLT FOLDER in the LOAD BOX first.']);
      return;
    }
    this.offerPendingImports();
  }

  private askSetCurrent(folder: FlightFolder | null): void {
    if (folder === null) {
      return;
    }
    this.dialog.set({
      kind: 'Information',
      lines: [`Set ${folder.label}`, 'as current FLT FOLDER?'],
      buttons: [
        {
          label: 'YES',
          action: () => {
            this.session.setCurrent(folder.id);
            this.refresh();
          },
        },
        { label: 'NO' },
      ],
    });
  }

  private askClosure(): void {
    this.dialog.set({
      kind: 'Caution',
      lines: ['The flight is closed without an export.', 'The current FLT FOLDER becomes read-only.'],
      buttons: [{ label: 'OK', action: () => this.session.closeFlight() }, { label: 'CANCEL' }],
    });
  }

  private administrator(): void {
    const folders = this.session.folders.get();
    const lines = ['FLT FOLDER administrator', ''];
    if (folders.length === 0) {
      lines.push('No FLT FOLDER on this laptop.');
    }
    for (const folder of folders) {
      lines.push(`${folder.label}  ${folderState(folder)}`);
    }
    this.dialog.set({
      kind: 'Information',
      lines,
      buttons: [
        {
          label: 'REMOVE CLOSED',
          action: () => {
            this.session.removeClosedFolders();
            this.refresh();
          },
        },
        { label: 'OK' },
      ],
    });
  }

  private exportFolder(kind: 'cfp' | 'full'): void {
    this.session.exportCurrent(kind, this.laptop.simTimeMs());
    this.view.set('folder');
    this.refresh();
    this.props.uiService.navigateTo('flt-ops/export-box');
  }

  // --- drawing ---------------------------------------------------------------------------------------------------

  private refresh(): void {
    const folder = this.folder();
    if (folder !== this.lastFolder) {
      this.folderSubscription?.destroy();
      this.folderSubscription = folder?.changed.sub(() => this.refresh()) ?? null;
      this.lastFolder = folder;
    }

    this.listLabel.set(folder?.label ?? '');
    this.listMenu.set(
      this.session.folders.get().map((f) => ({
        label: f.label,
        action: () => {
          this.shownId.set(f.id);
          this.selectedNode.set(FLIGHT_FOLDER_ROOT_ID);
          if (f.id !== this.session.currentId.get()) {
            this.askSetCurrent(f);
          }
          this.refresh();
        },
      })),
    );
    this.manageMenu.set(this.manageItems(folder));

    const doc = folder !== null ? this.selectedDoc(folder) : null;
    const docNode = folder !== null && doc !== null ? folder.document(doc) : null;
    const state = folder !== null && doc !== null ? folder.state(doc) : null;
    const editable = folder !== null && !folder.closed;

    this.previousDisabled.set(folder === null || folder.neighbour(doc, -1) === null);
    this.nextDisabled.set(folder === null || folder.neighbour(doc, 1) === null);
    this.deleteDisabled.set(!editable || doc === null || state?.deleted === true);
    this.noteDisabled.set(!editable || doc === null);
    this.noteLabel.set(this.noteOpen.get() ? 'HIDE NOTE' : state?.note ? 'SHOW NOTE' : 'NOTE');
    this.searchDisabled.set(docNode?.kind !== 'text');
    this.searchLabel.set(this.searchOpen.get() ? 'HIDE SEARCH' : 'SEARCH');
    const isPlan = docNode?.kind === 'flight-plan';
    this.planButtonsHidden.set(!isPlan);
    this.refreshDisabled.set(
      !isPlan ||
        folder === null ||
        folder.closed ||
        folder.id !== this.session.currentId.get() ||
        this.laptop.standalone.get(),
    );
    this.flownDisabled.set(!isPlan || folder === null || lastFlownLineIndex(navLogLines(folder.flightPlan)) < 0);
    this.selectDisabled.set(!editable || !isPlan);
    this.selectIsOn.set(isPlan && state?.selected === true);
    this.selectLabel.set(isPlan && state?.selected ? 'SELECTED' : 'SELECT');
    const constraint = docNode?.constraint ?? 'none';
    this.signHidden.set(constraint === 'none' || state?.deleted === true);
    this.signIsOn.set(state?.done != null);
    const signWord = constraint === 'check' ? 'CHECK' : 'SIGN';
    this.signLabel.set(state?.done ? `${signWord}ED` : signWord);
    this.loadNotes(folder);
    this.noteUnit.set(doc);
    this.printAvailable.set(docNode !== null);

    this.docTitle.set(this.titleOf(folder, doc));
    this.renderTree(folder);
    this.renderContent();
    this.renderExport();
  }

  private titleOf(folder: FlightFolder | null, doc: string | null): string {
    if (folder === null) {
      return '';
    }
    if (doc !== null) {
      return folder.documentName(doc);
    }
    const selected = this.selectedNode.get();
    const row = flightFolderTreeRows(folder, selected, this.expanded.get()).find((r) => r.id === selected);
    return row?.title ?? folder.label;
  }

  private renderTree(folder: FlightFolder | null): void {
    this.treeRows.set(
      folder === null ? [] : flightFolderTreeRows(folder, this.selectedNode.get(), this.expanded.get()),
    );
  }

  /** @param folder the displayed folder, whose notes the note field edits */
  private loadNotes(folder: FlightFolder | null): void {
    const stored: Record<string, string> = {};
    for (const id of folder?.documentOrder() ?? []) {
      const note = folder?.state(id)?.note;
      if (note) {
        stored[id] = note;
      }
    }
    this.notes.load(stored);
  }

  private selectRow(row: DocumentTreeRow): void {
    if (row.kind === 'folder' && !row.expanded && row.expandable) {
      this.expanded.set(new Set(this.expanded.get()).add(row.id));
    }
    this.selectNode(row.id);
  }

  private destroyContent(): void {
    const container = this.contentRef.getOrDefault();
    if (container) {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    }
    if (this.content?.instance instanceof DisplayComponent) {
      this.content.instance.destroy();
    }
    this.content = null;
  }

  /** The document window under the title: the text, a folder listing or the flight plan panels */
  private renderContent(): void {
    const container = this.contentRef.getOrDefault();
    if (!container) {
      return;
    }
    const folder = this.folder();
    const doc = folder !== null ? this.selectedDoc(folder) : null;
    const docNode = folder !== null && doc !== null ? folder.document(doc) : null;
    // The flight plan keeps its panels while only its folder changes: they follow the folder themselves
    if (docNode?.kind === 'flight-plan' && this.content !== null && container.dataset.doc === `${folder?.id}/${doc}`) {
      return;
    }
    this.destroyContent();
    container.dataset.doc = `${folder?.id}/${doc}`;
    if (folder === null) {
      this.occurrenceLine.set('');
      return;
    }
    if (docNode?.kind === 'flight-plan') {
      this.occurrenceLine.set('');
      const panels = (
        <OitFlightPlanPanels
          folder={folder}
          session={this.session}
          tabsHost={this.tabsHostRef.instance}
          headerHost={this.headerHostRef.instance}
          actions={this.navLogActions}
          report={this.laptop.flightReport}
          flownRequest={this.flownRequest}
          tab={this.planTab}
          keyboard={this.props.container}
          oisVersion={this.laptop.oisVersion}
          metric={this.metric}
        />
      );
      this.content = panels;
      FSComponent.render(panels, container);
      return;
    }
    if (docNode !== null) {
      this.renderText(container, docNode.text);
      return;
    }
    this.occurrenceLine.set('');
    this.renderListing(container, folder);
  }

  private renderText(container: HTMLElement, text: string): void {
    const search = this.searchOpen.get() ? this.searchLive : '';
    const occurrences = findOccurrences(text, search);
    this.occurrenceLine.set(search.trim() === '' ? '' : occurrencesText(occurrences.length));
    const pre = document.createElement('pre');
    pre.className = 'oit-eff-text';
    let from = 0;
    let currentElement: HTMLElement | null = null;
    occurrences.forEach(([start, end], index) => {
      pre.appendChild(document.createTextNode(text.substring(from, start)));
      const hit = document.createElement('span');
      hit.className = `hit${index === this.currentOccurrence.get() ? ' current' : ''}`;
      hit.textContent = text.substring(start, end);
      if (index === this.currentOccurrence.get()) {
        currentElement = hit;
      }
      pre.appendChild(hit);
      from = end;
    });
    pre.appendChild(document.createTextNode(text.substring(from)));
    container.appendChild(pre);
    if (currentElement !== null && typeof (currentElement as HTMLElement).scrollIntoView === 'function') {
      (currentElement as HTMLElement).scrollIntoView();
    }
  }

  private renderListing(container: HTMLElement, folder: FlightFolder): void {
    const listing = document.createElement('div');
    listing.className = 'oit-eff-listing';
    const entries = folderListing(folder, this.selectedNode.get());
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'oit-eff-listing-line oit-eff-listing-empty';
      empty.textContent = 'No document';
      listing.appendChild(empty);
    }
    for (const entry of entries) {
      const line = document.createElement('div');
      line.className = 'oit-eff-listing-line';
      line.textContent = entry.name;
      line.addEventListener('click', () => {
        this.expanded.set(new Set(this.expanded.get()).add(entry.id));
        this.selectNode(entry.id);
      });
      listing.appendChild(line);
    }
    container.appendChild(listing);
  }

  private destroyExport(container: HTMLElement): void {
    if (this.exportView?.instance instanceof DisplayComponent) {
      this.exportView.instance.destroy();
    }
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    this.exportView = null;
    this.exportFolderId = null;
  }

  /** The export view lists the current folder: it is drawn again when the other laptop makes another folder current */
  private renderExport(): void {
    const container = this.exportRef.getOrDefault();
    if (!container) {
      return;
    }
    const current = this.session.current.get();
    if (this.view.get() !== 'export' || current === null) {
      this.destroyExport(container);
      if (this.view.get() === 'export') {
        this.view.set('folder');
      }
      return;
    }
    if (this.exportView !== null && this.exportFolderId === current.id) {
      return;
    }
    this.destroyExport(container);
    const exportView = (
      <OitFlightFolderExport
        folder={current}
        onExport={(kind) => this.exportFolder(kind)}
        onReturn={() => {
          this.view.set('folder');
          this.refresh();
        }}
      />
    );
    this.exportView = exportView;
    this.exportFolderId = current.id;
    FSComponent.render(exportView, container);
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.paneScope = new PaneScope(this.appRef.instance, FOLDER_PANE_RULES, FOLDER_SCROLLERS);
    this.rowMenu = new NavLogRowMenu(this.appRef.instance);
    this.searchEntry.set(this.searchText.get());

    this.props.uiService.registerPageFunctions({
      print: { run: () => this.print(), available: this.printAvailable },
    });

    this.subs.push(
      this.treeLabel,
      this.masterLabel,
      this.masterDisabled,
      this.standaloneHidden,
      this.mainHidden,
      this.folderViewOnly,
      this.exportHidden,
      this.launchHidden,
      this.signVisible,
      this.noteHidden,
      this.searchHidden,
      this.session.folders.sub(() => this.refresh()),
      this.session.current.sub(() => this.refresh()),
      this.session.pending.sub(() => this.offerPendingImports()),
      this.view.sub(() => {
        this.refresh();
      }),
      this.dialog.sub((dialog) => {
        if (dialog === null) {
          this.refresh();
        }
      }),
      this.treeHidden.sub(() => this.refresh()),
      this.laptop.standalone.sub(() => this.refresh()),
      // The window was opened for the folder that was current then
      this.session.currentId.sub(() => this.nextWaypointRequest.set(null)),
    );

    this.refresh();
    this.startUp();
  }

  public destroy(): void {
    this.paneScope?.destroy();
    this.rowMenu?.destroy();
    this.rowMenu = null;
    this.nextWaypointRequest.set(null);
    this.nextWaypointRef.getOrDefault()?.destroy();
    // Destroy all subscriptions to remove all references to this instance.
    for (const s of this.subs) {
      s.destroy();
    }
    this.folderSubscription?.destroy();
    this.folderSubscription = null;
    this.lastFolder = null;
    this.destroyContent();
    if (this.exportView?.instance instanceof DisplayComponent) {
      this.exportView.instance.destroy();
    }
    // A window left open is not carried to the next display
    this.dialog.set(null);

    super.destroy();
  }

  render(): VNode {
    const menuId = `${this.captOrFo}_OIT_eff`;
    return (
      <div class="oit-page-container">
        <div ref={this.appRef} class="oit-eff-app">
          <div class="oit-eff-line">
            <Button
              idPrefix={`${menuId}_list`}
              label={this.listLabel}
              menuItems={this.listMenu}
              onClick={() => {}}
              disabled={this.folderViewOnly}
              containerStyle="width: 330px; margin-right: 8px;"
              buttonStyle="width: 100%;"
            />
            <Button
              label={this.treeLabel}
              disabled={this.folderViewOnly}
              onClick={() => this.treeHidden.set(!this.treeHidden.get())}
              buttonStyle="min-width: 130px;"
            />
            <div class={{ 'oit-eff-standalone': true, hidden: this.standaloneHidden }}>STANDALONE</div>
            <div class="oit-eff-spacer" />
            <Button
              label={this.masterLabel}
              disabled={this.masterDisabled}
              onClick={() => this.session.takeMaster()}
              buttonStyle="min-width: 150px;"
            />
          </div>
          <div class={{ 'oit-eff-line': true, hidden: this.mainHidden }}>
            <Button
              idPrefix={`${menuId}_manage`}
              label="MANAGE"
              menuItems={this.manageMenu}
              onClick={() => {}}
              containerStyle="width: 330px; margin-right: 8px;"
              buttonStyle="width: 100%;"
            />
            <Button
              label="<<"
              disabled={this.previousDisabled}
              onClick={() => this.step(-1)}
              buttonStyle="width: 44px;"
              containerStyle="margin-right: 4px;"
            />
            <Button
              label=">>"
              disabled={this.nextDisabled}
              onClick={() => this.step(1)}
              buttonStyle="width: 44px;"
              containerStyle="margin-right: 4px;"
            />
            <Button
              label="DELETE"
              disabled={this.deleteDisabled}
              onClick={() => this.deleteDisplayed()}
              buttonStyle="min-width: 100px;"
              containerStyle="margin-right: 4px;"
            />
            <Button
              label={this.noteLabel}
              disabled={this.noteDisabled}
              onClick={() => this.toggleNote()}
              buttonStyle="min-width: 130px;"
              containerStyle="margin-right: 4px;"
            />
            <Button
              label={this.searchLabel}
              disabled={this.searchDisabled}
              onClick={() => this.toggleSearch()}
              buttonStyle="min-width: 150px;"
            />
            <div class="oit-eff-spacer" />
            <div class={{ 'oit-eff-line-group': true, hidden: this.planButtonsHidden }}>
              <Button
                label="REFRESH"
                disabled={this.refreshDisabled}
                onClick={() => this.session.refreshFromOffside()}
                buttonStyle="min-width: 100px;"
                containerStyle="margin-right: 4px;"
              />
              <Button
                label="FLOWN WPT"
                disabled={this.flownDisabled}
                onClick={() => this.flownRequest.set(this.flownRequest.get() + 1)}
                buttonStyle="min-width: 140px; padding-left: 8px; padding-right: 8px;"
                containerStyle="margin-right: 4px;"
              />
            </div>
            <Button
              label={this.selectLabel}
              disabled={this.selectDisabled}
              selected={this.selectIsOn}
              onClick={() => this.selectPlan()}
              buttonStyle="min-width: 120px;"
              containerStyle="margin-right: 4px;"
            />
            <Button
              label={this.signLabel}
              visible={this.signVisible}
              selected={this.signIsOn}
              onClick={() => this.toggleDone()}
              buttonStyle="min-width: 120px;"
            />
          </div>
          <div class={{ 'oit-eff-main': true, hidden: this.mainHidden }}>
            <div class={{ 'oit-eff-tree': true, hidden: this.treeHidden }}>
              <DocumentTreeView
                rows={this.treeRows}
                onSelect={(row) => this.selectRow(row)}
                onToggle={(row) => this.toggleExpanded(row.id)}
              />
            </div>
            <div class="oit-eff-document">
              <div class="oit-eff-doc-head">
                <div class="oit-eff-doc-title">{this.docTitle}</div>
              </div>
              <div class={{ 'oit-eff-note': true, hidden: this.noteHidden }}>
                <DocumentNoteField
                  container={this.props.container}
                  notes={this.notes}
                  unitId={this.noteUnit}
                  onChanged={() => this.noteChanged()}
                />
              </div>
              <div class={{ 'oit-eff-search': true, hidden: this.searchHidden }}>
                <div class="oit-eff-search-label">SEARCH</div>
                <DocumentTextField
                  container={this.props.container}
                  entry={this.searchEntry}
                  maxLength={SEARCH_MAX_LENGTH}
                  width={480}
                />
                <Button label="<" onClick={() => this.stepSearch(-1)} />
                <Button label=">" onClick={() => this.stepSearch(1)} />
              </div>
              <div class={{ 'oit-eff-search-count': true, hidden: this.searchHidden }}>{this.occurrenceLine}</div>
              <div ref={this.tabsHostRef} class="oit-eff-tabs-host" />
              <div ref={this.headerHostRef} class="oit-eff-header-host" />
              <div ref={this.contentRef} class="oit-eff-content" />
            </div>
          </div>
          <div ref={this.exportRef} class={{ 'oit-eff-export-host': true, hidden: this.exportHidden }} />
          <OitNavLogNextWaypoint
            ref={this.nextWaypointRef}
            request={this.nextWaypointRequest}
            keyboard={this.props.container}
            confirm={(request, entry) =>
              !this.session.canEditFollowUp(request.folderId) ||
              this.session.nextWaypoint(request.fromKey, entry) !== 'rejected'
            }
          />
          <OisIdentificationDialog
            dialog={this.dialog}
            drafts={this.drafts}
            draftsPage={DIALOG_DRAFTS}
            keyboard={this.props.container}
            title="FLT FOLDER"
          />
          <div class={{ 'oit-eff-launch': true, hidden: this.launchHidden }}>
            <div class="oit-eff-launch-window">
              <div class="oit-eff-launch-title">Launching FLT FOLDER...</div>
              <div class="oit-eff-launch-body">
                Loading FLT FOLDER.
                <div class="oit-eff-progress">
                  <div ref={this.progressRef} class="oit-eff-progress-bar" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * @param id a line of the tree
 * @returns whether it is the note line of a document
 */
function unitIsNote(id: string | null): boolean {
  return id !== null && unitIdOfNoteRow(id) !== null;
}

/**
 * @param folder a flight folder
 * @returns its state for the administrator list
 */
function folderState(folder: FlightFolder): string {
  if (folder.exported === 'full') {
    return 'CLOSED - EXPORTED';
  }
  if (folder.closed) {
    return 'CLOSED - NOT EXPORTED';
  }
  return folder.exported === 'cfp' ? 'OPEN - EXPORTED BEFORE PUSH BACK' : 'OPEN';
}
