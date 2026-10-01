// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  ComponentProps,
  ConsumerSubject,
  DisplayComponent,
  EventBus,
  FSComponent,
  Subscribable,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';
import { NdSymbol, NdSymbolTypeFlags } from '@flybywiresim/fbw-sdk';
import { NdMapClick } from '@flybywiresim/navigation-display';
import {
  NdDirectToCourse,
  NdDirectToOption,
  NdInteractiveElement,
  NdInteractiveEvents,
  NdInteractiveRequest,
  NdInteractiveResolved,
  NdInteractiveSide,
  NdInteractiveState,
} from '@shared/NdInteractive';
import { InternalKccuKeyEvent } from '../MFD/shared/MFDSimvarPublisher';
import { formatUtc } from '../MFD/FMC/DirectToEta';

interface NdInteractiveProps extends ComponentProps {
  bus: EventBus;
  side: NdInteractiveSide;
  /** The KCCU cursor is in the ND window (the INSERT and ERASE buttons appear then only) */
  cursorInNd: Subscribable<boolean>;
  /** The lateral ND shows the map (not the OANS) */
  mapShown: Subscribable<boolean>;
}

/** An element of a list or a revision menu: the aircraft mock-up or a waypoint, NAVAID or airport */
type Selection = NdInteractiveElement | 'aircraft';

interface Revision {
  label: string;
  enabled: boolean;
  action: () => void;
}

/** The DIRECT TO page of the ND (FCOM DSC-31-20-30-90 P 6) */
interface DirectToPage {
  kind: 'directTo';
  target: NdInteractiveElement | null;
  option: NdDirectToOption;
  /** The CRS IN or CRS OUT course the flight crew entered (the default course of the FMS otherwise) */
  course: NdDirectToCourse | null;
}

/** The INSERT NEXT WPT page of the ND (FCOM DSC-31-20-30-90 P 15-17) */
interface InsertNextWptPage {
  kind: 'insertNextWpt';
  revised: NdInteractiveElement;
  next: NdInteractiveElement | null;
}

type Page = DirectToPage | InsertNextWptPage;

/** A KCCU entry sent to the FMS, waiting for its elements */
interface PendingEntry {
  requestId: number;
  text: string;
  /** The database ids chosen on the DUPLICATE page for the places of the entry */
  chosen: string[];
}

/** The DUPLICATE page (FCOM P 10, P 17): the elements of an entry that is not unique */
interface DuplicatePage {
  entry: PendingEntry;
  candidates: NdInteractiveElement[];
  distances: (number | null)[];
  /** The first row shown */
  from: number;
}

/** The field the KCCU keyboard writes in */
type Field = 'waypoint' | 'course';

const NO_STATE: NdInteractiveState = {
  tmpy: false,
  directTo: false,
  directToTarget: null,
  directToDistance: null,
  directToUtc: null,
  directToCourse: null,
  waypoints: [],
};

/** The DIRECT TO options, in the order of the OPTIONS panel */
const DIRECT_TO_OPTIONS = [
  NdDirectToOption.Direct,
  NdDirectToOption.DirectWithAbeam,
  NdDirectToOption.CrsIn,
  NdDirectToOption.CrsOut,
];

/** An element of the list and revision menus is this high, in pixels */
const ROW_HEIGHT = 30;

/** The DUPLICATE page shows this many elements at a time */
const DUPLICATE_ROWS = 4;

/** The latitude/longitude of a waypoint, as on the ND pages (FCOM P 16: 44°03.4N/008°13.3E) */
function formatLatLong(location: { lat: number; long: number }): string {
  const part = (value: number, degreesDigits: number, positive: string, negative: string) => {
    const abs = Math.abs(value);
    let degrees = Math.floor(abs);
    let minutes = Math.round((abs - degrees) * 600) / 10;
    if (minutes >= 60) {
      degrees += 1;
      minutes = 0;
    }
    return `${degrees.toString().padStart(degreesDigits, '0')}°${minutes.toFixed(1).padStart(4, '0')}${
      value < 0 ? negative : positive
    }`;
  };
  return `${part(location.lat, 2, 'N', 'S')}/${part(location.long, 3, 'E', 'W')}`;
}

/** The lat/long entry (DDMM.MN/DDDMM.ME, as on the MFD) of a click on a blank area of the ND, to the tenth of a minute */
function latLongEntry(location: { lat: number; long: number }): string {
  const part = (value: number, degreesDigits: number, positive: string, negative: string) => {
    const tenths = Math.round(Math.abs(value) * 600);
    const degrees = Math.floor(tenths / 600);
    const minutes = (tenths - degrees * 600) / 10;
    return `${degrees.toString().padStart(degreesDigits, '0')}${minutes.toFixed(1).padStart(4, '0')}${
      value < 0 ? negative : positive
    }`;
  };
  return `${part(location.lat, 2, 'N', 'S')}/${part(location.long, 3, 'E', 'W')}`;
}

/**
 * The interactive ND (A380 FCOM DSC-31-20-30-90): with the KCCU cursor on the lateral ND in ARC, PLAN or ROSE-NAV mode,
 * the flight crew clicks on an interactive area (the blue rectangle around a waypoint, NAVAID or airport, or the aircraft
 * mock-up); several elements there give a list first. The revision list of the element sends the revision to the FMS:
 * FROM P.POS DIR TO * (the DIRECT TO page), INSERT NEXT WPT (its page), DELETE *, DATA (the DATA / AIRPORT page on the
 * MFD). The waypoint fields of the pages take a click on the ND, the list, or a KCCU entry (with the DUPLICATE page).
 * The INSERT and ERASE buttons of the temporary flight plan appear while the cursor is in the ND.
 */
export class NdInteractive extends DisplayComponent<NdInteractiveProps> {
  private readonly rootRef = FSComponent.createRef<HTMLDivElement>();

  private readonly menuRef = FSComponent.createRef<HTMLDivElement>();

  private readonly pageRef = FSComponent.createRef<HTMLDivElement>();

  private readonly buttonsRef = FSComponent.createRef<HTMLDivElement>();

  private readonly subs: Subscription[] = [];

  private readonly state = ConsumerSubject.create<NdInteractiveState>(null, NO_STATE);

  private page: Page | null = null;

  /** The waypoint list of the page is open */
  private listOpen = false;

  /** The field the KCCU keyboard writes in, and the entry so far */
  private focused: Field | null = null;

  private typed = '';

  private nextRequestId = 1;

  private pending: PendingEntry | null = null;

  private duplicate: DuplicatePage | null = null;

  /**
   * A click on the map: a list of the elements under the cursor, or the revisions of the element; the waypoint of the
   * open page when it waits for one (a blank area gives a latitude/longitude waypoint)
   * @param click the click and the elements under the cursor
   */
  public onMapClick(click: NdMapClick): void {
    this.closeMenu();
    const elements = click.symbols
      .filter((symbol) => symbol.location !== null)
      .map((symbol) => NdInteractive.elementOf(symbol));
    const selections: Selection[] = elements.length > 0 ? elements : click.aircraft ? ['aircraft'] : [];
    // The waypoint of the page, with the cursor (P 10, P 17)
    const page = this.page;
    const pageWaitsForWaypoint =
      page !== null &&
      !this.duplicate &&
      ((page.kind === 'directTo' && page.target === null) || (page.kind === 'insertNextWpt' && page.next === null));
    if (pageWaitsForWaypoint) {
      if (elements.length === 1) {
        this.setPageWaypoint(elements[0]);
        return;
      }
      if (elements.length > 1) {
        this.showList(click.clientX, click.clientY, elements, true);
        return;
      }
      if (selections.length === 0 && click.coordinates) {
        // A blank area: a latitude/longitude waypoint, created by the FMS as a lat/long entry
        this.resolve({ requestId: this.nextRequestId++, text: latLongEntry(click.coordinates), chosen: [] });
        return;
      }
    }
    if (selections.length === 1) {
      this.showRevisions(click.clientX, click.clientY, selections[0]);
    } else if (selections.length > 1) {
      this.showList(click.clientX, click.clientY, selections, false);
    }
  }

  private static elementOf(symbol: NdSymbol): NdInteractiveElement {
    return {
      databaseId: symbol.databaseId,
      ident: symbol.ident,
      location: { lat: symbol.location?.lat ?? 0, long: symbol.location?.long ?? 0 },
      flightPlan: (symbol.type & NdSymbolTypeFlags.FlightPlan) !== 0,
      airport: (symbol.type & NdSymbolTypeFlags.Airport) !== 0,
    };
  }

  private send(request: NdInteractiveRequest): void {
    this.props.bus.getPublisher<NdInteractiveEvents>().pub('nd_interactive_request', request, true);
  }

  // ------------------------------------------------------------------------------------------ list and revisions

  /**
   * The list of the interactive elements under the cursor (P 3-4): the chosen one gives its revisions, or is the
   * waypoint of the open page
   */
  private showList(x: number, y: number, selections: Selection[], forPageWaypoint: boolean): void {
    const menu = this.openMenu(x, y);
    for (const selection of selections) {
      const row = this.menuRow(selection === 'aircraft' ? 'P.POS' : selection.ident, true);
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (forPageWaypoint && selection !== 'aircraft') {
          this.closeMenu();
          this.setPageWaypoint(selection);
        } else {
          this.showRevisions(x, y, selection);
        }
      });
      menu.appendChild(row);
    }
  }

  /** The revision list of an element (P 5): its ident (green in the flight plan, yellow in the temporary one) */
  private showRevisions(x: number, y: number, selection: Selection): void {
    const menu = this.openMenu(x, y);
    const state = this.state.get();
    const ident = document.createElement('div');
    ident.className = 'nd-interactive-ident';
    if (selection === 'aircraft') {
      ident.textContent = 'P.POS';
    } else {
      ident.textContent = selection.ident;
      if (selection.flightPlan) {
        ident.classList.add(state.tmpy ? 'Yellow' : 'Green');
      }
    }
    menu.appendChild(ident);
    for (const revision of this.revisionsOf(selection)) {
      const row = this.menuRow(revision.label, revision.enabled);
      if (revision.enabled) {
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeMenu();
          revision.action();
        });
      }
      menu.appendChild(row);
    }
  }

  /**
   * The revisions of an element (P 5): the aircraft mock-up DIR TO; a flight plan waypoint FROM P.POS DIR TO *, INSERT
   * NEXT WPT, DELETE * (and DATA for an airport); a database element FROM P.POS DIR TO * (and DATA for an airport). No
   * DIRECT TO while the ND shows a temporary flight plan (P 9), no revision while it shows a DIR TO one (P 1).
   */
  private revisionsOf(selection: Selection): Revision[] {
    const state = this.state.get();
    if (selection === 'aircraft') {
      return [{ label: 'DIR TO', enabled: !state.tmpy, action: () => this.openDirectTo(null) }];
    }
    const revisions: Revision[] = [
      {
        label: 'FROM P.POS DIR TO *',
        enabled: !state.tmpy,
        action: () => this.openDirectTo(selection),
      },
    ];
    if (selection.flightPlan) {
      revisions.push({
        label: 'INSERT NEXT WPT',
        enabled: !state.directTo,
        action: () => this.openInsertNextWpt(selection),
      });
      revisions.push({
        label: 'DELETE *',
        enabled: !state.directTo,
        action: () => this.send({ side: this.props.side, kind: 'delete', element: selection }),
      });
    }
    if (selection.airport) {
      revisions.push({
        label: 'DATA',
        enabled: true,
        action: () => this.send({ side: this.props.side, kind: 'data', element: selection }),
      });
    }
    return revisions;
  }

  private openMenu(x: number, y: number): HTMLDivElement {
    const menu = this.menuRef.instance;
    menu.innerHTML = '';
    menu.style.display = 'block';
    // Kept on the map, to the right of and below the cursor
    menu.style.left = `${Math.min(x + 10, 768 - 250)}px`;
    menu.style.top = `${Math.min(y + 10, 768 - 6 * ROW_HEIGHT)}px`;
    return menu;
  }

  private closeMenu(): void {
    const menu = this.menuRef.getOrDefault();
    if (menu) {
      menu.style.display = 'none';
      menu.innerHTML = '';
    }
  }

  private menuRow(text: string, enabled: boolean): HTMLDivElement {
    const row = document.createElement('div');
    row.className = enabled ? 'nd-interactive-row' : 'nd-interactive-row nd-interactive-disabled';
    row.textContent = text;
    return row;
  }

  // ------------------------------------------------------------------------------------------ pages

  /** The DIRECT TO page, with the target of the FROM P.POS DIR TO * revision, or none from the aircraft mock-up */
  private openDirectTo(target: NdInteractiveElement | null): void {
    this.page = { kind: 'directTo', target, option: NdDirectToOption.Direct, course: null };
    this.resetEntry();
    if (target) {
      this.sendDirectTo();
    }
    this.renderPage();
  }

  /** The INSERT NEXT WPT page of a flight plan waypoint (P 14) */
  private openInsertNextWpt(revised: NdInteractiveElement): void {
    this.page = { kind: 'insertNextWpt', revised, next: null };
    this.resetEntry();
    this.renderPage();
  }

  private closePage(): void {
    this.page = null;
    this.resetEntry();
    this.renderPage();
  }

  private resetEntry(): void {
    this.listOpen = false;
    this.focused = null;
    this.typed = '';
    this.pending = null;
    this.duplicate = null;
  }

  /** The waypoint of the page: the DIR TO target, or the next waypoint to insert */
  private setPageWaypoint(entry: NdInteractiveElement): void {
    const page = this.page;
    if (!page) {
      return;
    }
    this.listOpen = false;
    this.focused = null;
    this.typed = '';
    if (page.kind === 'directTo') {
      page.target = entry;
      this.sendDirectTo();
    } else {
      page.next = entry;
      this.send({ side: this.props.side, kind: 'insertNextWpt', revised: page.revised, next: entry });
    }
    this.renderPage();
  }

  private sendDirectTo(): void {
    const page = this.page;
    if (page?.kind === 'directTo' && page.target) {
      this.send({
        side: this.props.side,
        kind: 'directTo',
        target: page.target,
        option: page.option,
        course: page.course ?? undefined,
      });
    }
  }

  /** The ident shown in the waypoint field of the page */
  private pageWaypointIdent(): string {
    const page = this.page;
    const entry = page?.kind === 'directTo' ? page.target : page?.next;
    return entry?.ident ?? '';
  }

  // ------------------------------------------------------------------------------------------ KCCU entry

  /** A KCCU key of this side, for the focused field (the same keys as the MFD input fields) */
  private onKccuKey(key: string): void {
    if (this.focused === null || !this.page) {
      return;
    }
    if (/^[A-Z0-9]$/.test(key)) {
      this.typed += key;
    } else if (key === 'SP') {
      this.typed += ' ';
    } else if (key === 'SLASH') {
      this.typed += '/';
    } else if (key === 'DOT') {
      this.typed += '.';
    } else if (key === 'PLUSMINUS') {
      this.typed = this.typed.startsWith('-') ? this.typed.substring(1) : `-${this.typed}`;
    } else if (key === 'BACKSPACE' || key === 'CLR') {
      this.typed = this.typed.substring(0, this.typed.length - 1);
    } else if (key === 'ESC' || key === 'ESC2') {
      this.focused = null;
      this.typed = '';
    } else if (key === 'ENT') {
      this.enterField();
      return;
    } else {
      return;
    }
    this.renderPage();
  }

  private focusField(field: Field): void {
    this.focused = field;
    this.typed = '';
    this.listOpen = false;
    this.renderPage();
  }

  /** ENT in a field: the waypoint entry goes to the FMS for its elements; the course is checked here */
  private enterField(): void {
    const text = this.typed.trim().toUpperCase();
    const field = this.focused;
    this.focused = null;
    this.typed = '';
    if (text === '' || !this.page) {
      this.renderPage();
      return;
    }
    if (field === 'course') {
      this.enterCourse(text);
      return;
    }
    this.resolve({ requestId: this.nextRequestId++, text, chosen: [] });
  }

  /** The CRS IN or CRS OUT entry (as the MFD DIRECT TO page): NNN, with M or T for a magnetic or true course */
  private enterCourse(text: string): void {
    const page = this.page;
    if (page?.kind !== 'directTo') {
      return;
    }
    const match = text.match(/^([MT]?)(\d{1,3})([MT]?)$/);
    if (!match || (match[1] !== '' && match[3] !== '')) {
      this.send({ side: this.props.side, kind: 'error', error: 'format' });
      this.renderPage();
      return;
    }
    const course = Number(match[2]);
    if (course > 360) {
      this.send({ side: this.props.side, kind: 'error', error: 'outOfRange' });
      this.renderPage();
      return;
    }
    page.course = { course: course % 360, isTrue: match[1] === 'T' || match[3] === 'T' };
    this.sendDirectTo();
    this.renderPage();
  }

  private resolve(entry: PendingEntry): void {
    this.pending = entry;
    this.send({
      side: this.props.side,
      kind: 'resolve',
      requestId: entry.requestId,
      text: entry.text,
      chosen: entry.chosen,
    });
    this.renderPage();
  }

  /** The elements of a KCCU entry: one is the waypoint of the page, several open the DUPLICATE page, none (FMS message) */
  private onResolved(resolved: NdInteractiveResolved): void {
    const pending = this.pending;
    if (resolved.side !== this.props.side || !pending || resolved.requestId !== pending.requestId) {
      return;
    }
    this.pending = null;
    if (resolved.candidates.length === 1) {
      this.duplicate = null;
      this.setPageWaypoint(resolved.candidates[0]);
      return;
    }
    if (resolved.candidates.length > 1) {
      this.duplicate = { entry: pending, candidates: resolved.candidates, distances: resolved.distances, from: 0 };
    } else {
      this.duplicate = null;
    }
    this.renderPage();
  }

  /** A choice on the DUPLICATE page: the entry is resolved again with it */
  private chooseDuplicate(candidate: NdInteractiveElement): void {
    const duplicate = this.duplicate;
    if (!duplicate) {
      return;
    }
    this.duplicate = null;
    this.resolve({
      requestId: this.nextRequestId++,
      text: duplicate.entry.text,
      chosen: [...duplicate.entry.chosen, candidate.databaseId],
    });
  }

  // ------------------------------------------------------------------------------------------ rendering

  /** The page at the bottom of the display: DIRECT TO (P 6), INSERT NEXT WPT (P 15-17) or DUPLICATE (P 10) */
  private renderPage(): void {
    const root = this.pageRef.getOrDefault();
    if (!root) {
      return;
    }
    root.innerHTML = '';
    const page = this.page;
    if (!page || !this.props.mapShown.get()) {
      root.style.display = 'none';
      return;
    }
    root.style.display = 'block';
    if (this.duplicate) {
      this.renderDuplicate(root, this.duplicate);
      return;
    }
    if (page.kind === 'directTo') {
      this.renderDirectTo(root, page);
    } else {
      this.renderInsertNextWpt(root, page);
    }
    if (!this.state.get().tmpy) {
      const cancel = document.createElement('div');
      cancel.className = 'nd-interactive-button nd-interactive-cancel';
      cancel.textContent = 'CANCEL';
      cancel.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closePage();
      });
      root.appendChild(cancel);
    }
  }

  /**
   * The waypoint field of a page (P 10, P 17): a click on the ident takes the KCCU entry, the arrow opens the list of
   * the flight plan waypoints
   */
  private waypointField(root: HTMLElement, label: string, className: string): void {
    const state = this.state.get();
    const line = document.createElement('div');
    line.className = className;
    line.innerHTML = `<span class="White">${label}</span>`;
    const field = document.createElement('div');
    field.className = 'nd-interactive-field';
    const text = document.createElement('span');
    if (this.focused === 'waypoint') {
      field.classList.add('nd-interactive-focused');
      text.className = 'Cyan';
      text.textContent = this.typed;
    } else {
      text.className = state.tmpy ? 'Yellow' : 'Cyan';
      text.textContent = this.pending ? this.pending.text : this.pageWaypointIdent();
    }
    text.className += ' nd-interactive-field-text';
    text.addEventListener('click', (e) => {
      e.stopPropagation();
      this.focusField('waypoint');
    });
    const arrow = document.createElement('span');
    arrow.className = 'nd-interactive-field-arrow';
    arrow.textContent = '▼';
    arrow.addEventListener('click', (e) => {
      e.stopPropagation();
      this.listOpen = !this.listOpen;
      this.focused = null;
      this.typed = '';
      this.renderPage();
    });
    field.appendChild(text);
    field.appendChild(arrow);
    line.appendChild(field);
    root.appendChild(line);

    if (this.listOpen) {
      const list = document.createElement('div');
      list.className = 'nd-interactive-list';
      for (const waypoint of state.waypoints) {
        const row = this.menuRow(waypoint.ident, true);
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          this.setPageWaypoint(waypoint);
        });
        list.appendChild(row);
      }
      field.appendChild(list);
    }
  }

  /** The DIRECT TO page (P 6): the target and its list, UTC and DIST, the OPTIONS with the CRS field (P 11) */
  private renderDirectTo(root: HTMLElement, page: DirectToPage): void {
    const state = this.state.get();
    this.waypointField(root, 'DIRECT TO', 'nd-interactive-dirto-target');

    const info = document.createElement('div');
    info.className = 'nd-interactive-dirto-info';
    const distance = state.directTo && state.directToDistance !== null ? Math.round(state.directToDistance) : null;
    info.innerHTML = `<div><span class="White">UTC</span> <span class="Yellow">${formatUtc(
      state.directTo ? state.directToUtc : null,
    )}</span></div><div><span class="White">DIST</span> <span class="Yellow">${
      distance !== null ? distance.toFixed(0) : '---'
    }</span> <span class="Cyan">NM</span></div>`;
    root.appendChild(info);

    const options = document.createElement('div');
    options.className = 'nd-interactive-options';
    for (const option of DIRECT_TO_OPTIONS) {
      const row = document.createElement('div');
      row.className = 'nd-interactive-option';
      const selected = page.option === option;
      row.innerHTML = `<span class="${selected ? 'Yellow' : 'White'}">${selected ? '●' : '○'}</span> <span class="${
        selected ? 'Yellow' : 'White'
      }">${option}</span>`;
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        page.option = option;
        page.course = null;
        this.focused = null;
        this.typed = '';
        this.sendDirectTo();
        this.renderPage();
      });
      options.appendChild(row);
    }
    // The CRS entry field next to the selected CRS IN or CRS OUT option (P 11)
    if (page.option === NdDirectToOption.CrsIn || page.option === NdDirectToOption.CrsOut) {
      const field = document.createElement('div');
      field.className = `nd-interactive-field nd-interactive-course ${
        page.option === NdDirectToOption.CrsIn ? 'nd-interactive-course-in' : 'nd-interactive-course-out'
      }`;
      const course = page.course ?? state.directToCourse;
      if (this.focused === 'course') {
        field.classList.add('nd-interactive-focused');
        field.innerHTML = `<span class="Cyan">${this.typed}</span>`;
      } else {
        field.innerHTML = `<span class="${state.directTo ? 'Yellow' : 'Cyan'}">${
          course ? course.course.toFixed(0).padStart(3, '0') : '---'
        }</span><span class="Cyan">°${course?.isTrue ? 'T' : ''}</span>`;
      }
      field.addEventListener('click', (e) => {
        e.stopPropagation();
        this.focusField('course');
      });
      options.appendChild(field);
    }
    root.appendChild(options);
  }

  /**
   * The INSERT NEXT WPT page (P 15-17): the revised waypoint (FROM, green in the active flight plan, yellow in the
   * temporary one), IN TMPY, its latitude/longitude (unless it is the FROM waypoint), the NEXT WPT field and list
   */
  private renderInsertNextWpt(root: HTMLElement, page: InsertNextWptPage): void {
    const state = this.state.get();
    const color = state.tmpy ? 'Yellow' : 'Green';
    const revised = document.createElement('div');
    revised.className = 'nd-interactive-revised';
    revised.innerHTML = `<span class="White">FROM</span> <span class="${color}">${page.revised.ident}</span>${
      state.tmpy ? ' <span class="White">IN</span> <span class="Yellow">TMPY</span>' : ''
    }`;
    root.appendChild(revised);
    // The FROM waypoint of the flight plan is not in the DIR TO list, which starts at the TO waypoint
    const isFromWaypoint = !state.waypoints.some((w) => w.databaseId === page.revised.databaseId);
    if (!isFromWaypoint) {
      const location = document.createElement('div');
      location.className = `nd-interactive-revised-location ${color}`;
      location.textContent = formatLatLong(page.revised.location);
      root.appendChild(location);
    }
    this.waypointField(root, 'NEXT WPT', 'nd-interactive-next-target');
  }

  /** The DUPLICATE page (P 10): the elements of the entry, nearest first, with RETURN and the scroll arrows */
  private renderDuplicate(root: HTMLElement, duplicate: DuplicatePage): void {
    const header = document.createElement('div');
    header.className = 'nd-interactive-duplicate-row nd-interactive-duplicate-header';
    header.innerHTML = '<span>DUPLICATE</span><span>DIST(NM)</span><span>LAT/LONG</span>';
    root.appendChild(header);
    const rows = document.createElement('div');
    rows.className = 'nd-interactive-duplicate-rows';
    for (let i = duplicate.from; i < Math.min(duplicate.from + DUPLICATE_ROWS, duplicate.candidates.length); i++) {
      const candidate = duplicate.candidates[i];
      const distance = duplicate.distances[i];
      const row = document.createElement('div');
      row.className = 'nd-interactive-duplicate-row nd-interactive-row Green';
      row.innerHTML = `<span>${candidate.ident}</span><span>${
        distance !== null ? distance.toFixed(1).padStart(6, '0') : '----.-'
      }</span><span>${formatLatLong(candidate.location)}</span>`;
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        this.chooseDuplicate(candidate);
      });
      rows.appendChild(row);
    }
    root.appendChild(rows);

    const button = (label: string, className: string, enabled: boolean, onClick: () => void) => {
      const element = document.createElement('div');
      element.className = `nd-interactive-button ${className}${enabled ? '' : ' nd-interactive-disabled'}`;
      element.textContent = label;
      if (enabled) {
        element.addEventListener('click', (e) => {
          e.stopPropagation();
          onClick();
        });
      }
      root.appendChild(element);
    };
    button('RETURN', 'nd-interactive-return', true, () => {
      this.duplicate = null;
      this.renderPage();
    });
    button('▼', 'nd-interactive-scroll-down', duplicate.from + DUPLICATE_ROWS < duplicate.candidates.length, () => {
      duplicate.from += DUPLICATE_ROWS;
      this.renderPage();
    });
    button('▲', 'nd-interactive-scroll-up', duplicate.from > 0, () => {
      duplicate.from = Math.max(0, duplicate.from - DUPLICATE_ROWS);
      this.renderPage();
    });
  }

  // ------------------------------------------------------------------------------------------ INSERT / ERASE

  /** INSERT DIR TO * and ERASE DIR TO * (P 12), or INSERT TMPY * and ERASE TMPY * (P 22-23), while the cursor is in the ND */
  private renderButtons(): void {
    const root = this.buttonsRef.getOrDefault();
    if (!root) {
      return;
    }
    root.innerHTML = '';
    const state = this.state.get();
    if (!state.tmpy || !this.props.cursorInNd.get() || !this.props.mapShown.get()) {
      return;
    }
    const what = state.directTo ? 'DIR TO*' : 'TMPY *';
    const button = (label: string, className: string, onClick: () => void) => {
      const element = document.createElement('div');
      element.className = `nd-interactive-button nd-interactive-tmpy ${className}`;
      element.innerHTML = `<span>${label}</span><span>${what}</span>`;
      element.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
      root.appendChild(element);
    };
    // The pages close with their temporary flight plan (P 12, P 17)
    button('ERASE', 'nd-interactive-erase', () => {
      this.send({ side: this.props.side, kind: 'eraseTmpy' });
      this.closePage();
    });
    button('INSERT', 'nd-interactive-insert', () => {
      this.send({ side: this.props.side, kind: 'insertTmpy' });
      this.closePage();
    });
  }

  onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<NdInteractiveEvents & InternalKccuKeyEvent>();
    this.state.setConsumer(sub.on('nd_interactive_state'));

    this.subs.push(
      sub.on('nd_interactive_resolved').handle((resolved) => this.onResolved(resolved)),
      sub.on('kccuKeyEvent').handle(([side, key]) => {
        if (side === this.props.side) {
          this.onKccuKey(key);
        }
      }),
      this.state.sub(() => {
        this.renderButtons();
        this.renderPage();
      }, true),
      this.props.cursorInNd.sub(() => this.renderButtons(), true),
      this.props.mapShown.sub((shown) => {
        if (!shown) {
          this.closeMenu();
        }
        this.renderButtons();
        this.renderPage();
      }, true),
    );
  }

  destroy(): void {
    this.subs.forEach((s) => s.destroy());
    this.state.destroy();
    super.destroy();
  }

  render(): VNode {
    return (
      <div ref={this.rootRef} class="nd-interactive">
        <div ref={this.menuRef} class="nd-interactive-menu" style="display: none;" />
        <div ref={this.pageRef} class="nd-interactive-page" style="display: none;" />
        <div ref={this.buttonsRef} />
      </div>
    );
  }
}
