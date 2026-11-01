//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ComponentProps, DisplayComponent, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { FlightFolder } from '../../../System/FlightFolder';
import { FlightFolderSession } from '../../../System/FlightFolderSession';
import {
  clockText,
  durationText,
  EffNavLogActual,
  EffNavLogLine,
  NAV_LOG_ROWS_PER_PAGE,
  navLogLines,
  nearbyTimeMs,
  parseClockTime,
  parseWeight,
  weightText,
} from '../../../System/FlightFolderFlightPlan';
import { LogbookFieldKeyboard } from '../../NssAvncs/Logbook/LogbookWidgets';
import { OitPerfEntryFormat } from '../Performance/OitPerfEntryFormat';
import './flight-folder.scss';

/** A line of the menu after a waypoint of the NAV LOG */
export interface NavLogMenuItem {
  readonly label: string;
  readonly disabled: boolean;
  readonly action: () => void;
}

/** What the NAV LOG asks of the page it is on: the menu, the NEXT WPT window and the DELETE confirmation */
export interface NavLogActions {
  menu(anchor: HTMLElement, items: NavLogMenuItem[]): void;
  nextWaypoint(fromKey: string, fromIdent: string): void;
  confirmDelete(key: string, ident: string): void;
}

interface OitNavLogPanelProps extends ComponentProps {
  readonly folder: FlightFolder;
  readonly session: FlightFolderSession;
  readonly keyboard: LogbookFieldKeyboard;
  /** Whether the aircraft shows tonnes (else thousands of pounds) */
  readonly metric: boolean;
  /** The page of the log, counted from 0 */
  readonly page: number;
  /** The element above the scrolled content that holds the column titles: they stay in view while the rows scroll */
  readonly headerHost: HTMLElement;
  readonly actions: NavLogActions;
}

type BoxKind = 'ata' | 'afob' | 'afu';

/**
 * A row on the page: its element, what it showed when it was drawn, and the entry fields in it. The structure is what
 * decides which elements the row has; the computed texts change without changing the elements.
 */
interface DrawnRow {
  readonly element: HTMLElement;
  readonly structure: string;
  texts: string[];
  readonly textCells: HTMLElement[];
  readonly fields: VNode[];
}

/** The classes of the computed cells of a row, in the order of OitNavLogPanel.computedTexts */
const COMPUTED_CELL_CLASSES = [
  'cell green',
  'cell green',
  'cell green',
  'cell',
  'cell green',
  'cell',
  'cell',
  'cell',
  'cell green',
  'cell green',
  'cell green',
];

/**
 * @param className the classes of the element
 * @param text its text
 * @returns a div
 */
function div(className: string, text?: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = className;
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

/**
 * One page of the NAV LOG panel: two lines for each waypoint. Green values are computed, the boxes hold the data of the
 * avionics (magenta) that the crew with the master status can also type, a waypoint the crew inserted is cyan, a
 * waypoint NEXT WPT went past is grey, and a flown waypoint the crew has not checked yet is in a yellow frame.
 * A row is drawn again only when its boxes or its state change, and the computed values change in place: the box the
 * crew is typing in stays while the others change.
 */
export class OitNavLogPanel extends DestroyableComponent<OitNavLogPanelProps> {
  private readonly hostRef = FSComponent.createRef<HTMLDivElement>();

  private readonly drawnRows = new Map<string, DrawnRow>();
  private rebuildTimer: number | null = null;
  private headerElement: HTMLElement | null = null;

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.headerElement = this.header();
    this.props.headerHost.appendChild(this.headerElement);
    this.props.headerHost.style.display = 'block';
    this.subscriptions.push(
      this.props.folder.changed.sub(() => this.scheduleRebuild()),
      this.props.session.isMaster.sub(() => this.scheduleRebuild()),
      this.props.session.currentId.sub(() => this.scheduleRebuild()),
    );
    this.rebuild();
  }

  public destroy(): void {
    if (this.rebuildTimer !== null) {
      window.clearTimeout(this.rebuildTimer);
    }
    this.drawnRows.forEach((row) => this.destroyFields(row));
    this.drawnRows.clear();
    if (this.headerElement !== null && this.headerElement.parentElement === this.props.headerHost) {
      this.props.headerHost.removeChild(this.headerElement);
    }
    this.props.headerHost.style.display = 'none';
    super.destroy();
  }

  /** A change can come from an entry field of the page: the field is not destroyed in its own handler */
  private scheduleRebuild(): void {
    if (this.rebuildTimer === null) {
      this.rebuildTimer = window.setTimeout(() => {
        this.rebuildTimer = null;
        this.rebuild();
      }, 0);
    }
  }

  /** @returns whether this laptop can type in the NAV LOG: it is the master of the open current folder */
  private editable(): boolean {
    return this.props.session.canEditFollowUp(this.props.folder.id);
  }

  private destroyFields(row: DrawnRow): void {
    for (const field of row.fields) {
      if (field.instance instanceof DisplayComponent) {
        field.instance.destroy();
      }
    }
  }

  private rebuild(): void {
    const host = this.hostRef.getOrDefault();
    if (!host) {
      return;
    }
    const allLines = navLogLines(this.props.folder.flightPlan);
    const from = this.props.page * NAV_LOG_ROWS_PER_PAGE;
    const editable = this.editable();

    const keys = new Set<string>();
    let position = 0;
    for (let index = from; index < Math.min(allLines.length, from + NAV_LOG_ROWS_PER_PAGE); index++) {
      const line = allLines[index];
      keys.add(line.key);
      const structure = JSON.stringify([
        line.key,
        line.ident,
        line.directTo,
        line.skipped,
        line.pending,
        line.checked,
        line.fuelCheckShown,
        line.ataMs,
        line.afobKg,
        line.afuKg,
        editable,
      ]);
      const texts = this.computedTexts(line);
      let drawn = this.drawnRows.get(line.key);
      if (drawn === undefined || drawn.structure !== structure) {
        if (drawn !== undefined) {
          this.destroyFields(drawn);
          host.removeChild(drawn.element);
        }
        drawn = this.row(line, editable, nearbyTimeMs(allLines, index, this.props.folder.flightPlan.baseMs), structure);
        this.drawnRows.set(line.key, drawn);
      } else {
        const shown = drawn;
        texts.forEach((text, i) => {
          if (text !== shown.texts[i]) {
            shown.textCells[i].textContent = text;
          }
        });
        drawn.texts = texts;
      }
      // A row that is already in place is not touched: moving the element the crew types in would take it from them
      const expected = host.children[position];
      if (expected !== drawn.element) {
        host.insertBefore(drawn.element, expected ?? null);
      }
      position++;
    }
    this.drawnRows.forEach((drawn, key) => {
      if (!keys.has(key)) {
        this.destroyFields(drawn);
        host.removeChild(drawn.element);
        this.drawnRows.delete(key);
      }
    });
  }

  private header(): HTMLElement {
    const header = div('oit-eff-nl-header');
    for (const labels of [
      ['WPT', 'DIRTO', 'ET', 'ETA', 'AT', 'EFOB', 'ΔFOB', 'EFU', 'FUEL CHK'],
      ['AWY', 'MORA', 'CT', 'ATA', 'RETA', 'AFOB', 'ΔFUEL', 'AFU', ''],
    ]) {
      const line = div('oit-eff-nl-line');
      labels.forEach((label) => line.appendChild(div('cell', label)));
      header.appendChild(line);
    }
    return header;
  }

  /**
   * @param line the row
   * @returns the texts of the cells that follow from the plan and the other rows, not from what the crew typed
   */
  private computedTexts(line: EffNavLogLine): string[] {
    const metric = this.props.metric;
    return [
      durationText(line.legS),
      clockText(line.etaMs),
      durationText(line.atS),
      weightText(line.efobKg, metric),
      weightText(line.deltaFobKg, metric),
      weightText(line.efuKg, metric),
      line.airway,
      line.moraHundredFeet !== null ? String(line.moraHundredFeet) : '',
      durationText(line.cumS),
      clockText(line.retaMs),
      weightText(line.deltaFuelKg, metric),
    ];
  }

  private row(line: EffNavLogLine, editable: boolean, referenceMs: number, structure: string): DrawnRow {
    const fields: VNode[] = [];
    const texts = this.computedTexts(line);
    const textCells = texts.map((text, i) => div(COMPUTED_CELL_CLASSES[i], text));
    const element = div(`oit-eff-nl-row${line.pending ? ' pending' : ''}${line.skipped ? ' skipped' : ''}`);
    element.setAttribute('data-key', line.key);

    const first = div('oit-eff-nl-line');
    first.appendChild(this.identCell(line, editable));
    first.appendChild(this.directToCell(line));
    textCells.slice(0, 6).forEach((cell) => first.appendChild(cell));
    first.appendChild(this.fuelCheckCell(line, editable));

    const second = div('oit-eff-nl-line');
    second.appendChild(textCells[6]);
    second.appendChild(textCells[7]);
    second.appendChild(textCells[8]);
    second.appendChild(this.boxCell(line, 'ata', editable, referenceMs, fields));
    second.appendChild(textCells[9]);
    second.appendChild(this.boxCell(line, 'afob', editable, referenceMs, fields));
    second.appendChild(textCells[10]);
    second.appendChild(this.boxCell(line, 'afu', editable, referenceMs, fields));
    second.appendChild(div('cell'));

    element.appendChild(first);
    element.appendChild(second);
    return { element, structure, texts, textCells, fields };
  }

  private identCell(line: EffNavLogLine, editable: boolean): HTMLElement {
    const cell = div('cell ident');
    const target = div('oit-eff-nl-menu-target');
    target.appendChild(div(`oit-eff-nl-name${line.inserted ? ' inserted' : ''}`, line.ident));
    target.appendChild(div('oit-eff-nl-arrow'));
    target.addEventListener('click', () =>
      this.props.actions.menu(target, [
        {
          label: 'NEXT WPT',
          disabled: !editable,
          action: () => this.props.actions.nextWaypoint(line.key, line.ident),
        },
        {
          label: 'DELETE',
          disabled: !editable || !line.inserted || line.checked,
          action: () => this.props.actions.confirmDelete(line.key, line.ident),
        },
      ]),
    );
    cell.appendChild(target);
    return cell;
  }

  private directToCell(line: EffNavLogLine): HTMLElement {
    const cell = div('cell');
    cell.appendChild(div('oit-eff-nl-box', line.directTo ?? ''));
    return cell;
  }

  private fuelCheckCell(line: EffNavLogLine, editable: boolean): HTMLElement {
    const cell = div('cell');
    if (!line.fuelCheckShown) {
      return cell;
    }
    const check = div(`oit-eff-nl-check${line.checked ? ' checked' : ''}${editable && !line.checked ? '' : ' locked'}`);
    check.appendChild(div('oit-eff-nl-tick'));
    check.appendChild(div('oit-eff-nl-check-label', line.checked ? 'CHECKED' : 'FUEL CHK'));
    check.addEventListener('click', () => {
      if (!line.checked && this.editable()) {
        this.props.session.checkFuel(line.key);
      }
    });
    cell.appendChild(check);
    return cell;
  }

  // The crew with the master status types into the box; everyone else sees the value
  private boxCell(
    line: EffNavLogLine,
    kind: BoxKind,
    editable: boolean,
    referenceMs: number,
    fields: VNode[],
  ): HTMLElement {
    const metric = this.props.metric;
    const cell = div('cell');
    const box = div('oit-eff-nl-box avionics');
    cell.appendChild(box);
    const value = kind === 'ata' ? line.ataMs : kind === 'afob' ? line.afobKg : line.afuKg;
    if (!editable || line.checked) {
      box.textContent = kind === 'ata' ? clockText(value) : weightText(value, metric);
      return cell;
    }
    const format =
      kind === 'ata'
        ? new OitPerfEntryFormat<number>((text) => parseClockTime(text, referenceMs), clockText, 5)
        : new OitPerfEntryFormat<number>(
            (text) => parseWeight(text, metric),
            (kg) => weightText(kg, metric),
            6,
          );
    const field = (
      <InputField<number>
        dataEntryFormat={format}
        value={Subject.create<number | null>(value)}
        onModified={(entered) => {
          if (this.editable()) {
            this.props.session.setNavLogActual(line.key, this.patch(kind, entered));
          }
        }}
        canBeCleared={true}
        alignText="flex-end"
        containerStyle="width: 100%;"
        hEventConsumer={this.props.keyboard.hEventConsumer}
        interactionMode={this.props.keyboard.interactionMode}
        errorHandler={() => {}}
      />
    );
    FSComponent.render(field, box);
    fields.push(field);
    return cell;
  }

  private patch(kind: BoxKind, value: number | null): Partial<EffNavLogActual> {
    return kind === 'ata' ? { ataMs: value } : kind === 'afob' ? { afobKg: value } : { afuKg: value };
  }

  render(): VNode {
    return <div ref={this.hostRef} class="oit-eff-nl" />;
  }
}
