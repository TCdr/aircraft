//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  ArraySubject,
  DisplayComponent,
  FSComponent,
  MappedSubject,
  NodeReference,
  Subject,
  Subscribable,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';
import { NXDataStore } from '@flybywiresim/fbw-sdk';
import { AbstractOitFltOpsPageProps } from '../../../OIT';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { DropdownMenu } from '../../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { DataEntryFormat } from '../../../../MFD/pages/common/DataEntryFormats';
import { WindEntry, missingParameterErrors } from '../../../System/Performance/PerformanceEntries';
import { PerformanceRunway } from '../../../System/Performance/PerformanceRunways';
import { RunwayComputationMode } from '../../../System/Performance/FltOpsPerformanceSession';
import { RunwayResultItem } from '../../../System/Performance/MultipleRunwayResults';
import {
  AircraftStatusItem,
  EMPTY_AIRCRAFT_STATUS,
  FltOpsAircraftStatus,
  PerformanceApplication,
  aircraftStatusItemText,
  deleteAircraftStatusItem,
  itemsNotInComputation,
  reminderLines,
} from '../../../System/Performance/AircraftStatus';
import { parseTechLogbook } from '../../../System/TechLogbook';
import { TECH_LOGBOOK_STORAGE_KEY } from '../../../System/TechLogbookStore';
import { OitPerfEntryFormat } from './OitPerfEntryFormat';
import { OitPerfRunwaySelection } from './OitPerfRunwaySelection';
import './performance.scss';

/** The width an input field takes per digit of its digit count, px */
const FIELD_DIGIT_WIDTH = 18;

/** The arrow of a list and the frames of the list and of its field, px */
const LIST_ARROW_AND_FRAMES_WIDTH = 37;

/** The tick of a ticked row of the MULTIPLE RWY COMPUTATION table */
const TICK_PATH = 'M4 12 L10 18 L20 5';

/** A column of the MULTIPLE RWY COMPUTATION table */
export interface RunwayTableColumn {
  readonly label: string;
  readonly unit: string;
  readonly width: number;
  readonly value: (runway: PerformanceRunway) => string;
}

/** The runway computations of T.O PERF and LDG PERF as the airport panel uses them */
interface RunwayComputationEntries {
  readonly computationMode: Subject<RunwayComputationMode>;
  readonly multipleRunways: Subject<readonly string[]>;
}

/** @returns the eLogbook of the NSS, which the FLT OPS domain only reads; null when there is none */
function readLogbook() {
  return parseTechLogbook(NXDataStore.getLegacy(TECH_LOGBOOK_STORAGE_KEY, ''));
}

/** A text box in yellow (a value from another application), and what an entry does instead of setting the value */
interface BoxOptions<T> {
  readonly yellow?: Subscribable<boolean>;
  readonly onModified?: (value: T | null) => void;
  readonly disabled?: Subscribable<boolean>;
}

/**
 * The parts the performance application pages share: labelled rows, text boxes, lists, the airport row, the RESULTS
 * texts, the ERROR list, the MULTIPLE RWY COMPUTATION table and the AIRCRAFT STATUS. R is the type of the results of
 * the application.
 */
export abstract class OitPerfPageBase<P extends AbstractOitFltOpsPageProps, R> extends DisplayComponent<P> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  protected readonly subs = [] as Subscription[];

  /** The page name in the ids of its lists */
  protected abstract readonly pageId: string;

  /** The application in the AIRCRAFT STATUS lists */
  protected abstract readonly application: PerformanceApplication;

  /** The results of the last computation, null before one or after a change of entry */
  protected abstract readonly results: Subscribable<R | null>;

  protected readonly fieldsDisabled = Subject.create(false);

  /** The FLT OPS performance applications of the laptop */
  protected readonly session = this.props.container.laptopData.performance;

  /** The AIRCRAFT STATUS of the FLT OPS domain */
  protected readonly aircraftStatus = this.session.aircraftStatus.map((status) => status ?? EMPTY_AIRCRAFT_STATUS);

  /** The AIRCRAFT STATUS panel (ACFT STS) is open */
  protected readonly aircraftStatusShown = Subject.create(false);

  /** The item selected in the AIRCRAFT STATUS panel, for DELETE */
  private readonly selectedStatusItem = Subject.create<string | null>(null);

  private readonly negligibleItemsFormat = new OitPerfEntryFormat<number>(
    (text) => (/^\d{1,2}$/.test(text.trim()) ? parseInt(text.trim(), 10) : null),
    (n) => n.toFixed(0),
    2,
  );

  private readonly negligibleItems = Subject.create<number | null>(0);

  /** Plain elements that take clicks: the sim browser never fires an onClick set on a plain element in JSX */
  private readonly clickTargets: { readonly ref: NodeReference<HTMLElement>; readonly handler: () => void }[] = [];

  /** The lines the page draws itself into its elements, drawn once the elements exist */
  private readonly drawnAfterRender: (() => void)[] = [];

  /**
   * @param subscription a subscription of the page
   * @returns the subscription, destroyed with the page
   */
  protected tracked<S extends Subscription>(subscription: S): S {
    this.subs.push(subscription);
    return subscription;
  }

  /**
   * @param handler what a click on the element does
   * @returns the reference to give the element
   */
  protected clickRef<T extends HTMLElement = HTMLDivElement>(handler: () => void): NodeReference<T> {
    const ref = FSComponent.createRef<T>();
    this.clickTargets.push({ ref, handler });
    return ref;
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    for (const target of this.clickTargets) {
      target.ref.getOrDefault()?.addEventListener('click', target.handler);
    }
    for (const draw of this.drawnAfterRender) {
      draw();
    }
    this.subs.push(
      this.aircraftStatus,
      this.aircraftStatus.sub((status) => this.negligibleItems.set(status.negligibleCdlItems), true),
    );
  }

  /** The application is shown: the FLT OPS domain takes the eLogbook status when it has none yet */
  protected takeLogbookStatus(): void {
    this.session.onApplicationShown(readLogbook);
  }

  /** SYNCHRO LOGBOOK: the aircraft status of the whole FLT OPS domain becomes the deferred items of the eLogbook */
  protected synchroLogbook(): void {
    this.session.synchroLogbook(readLogbook());
    this.selectedStatusItem.set(null);
  }

  protected row(label: string, unit: string | null, field: VNode, after?: VNode, labelClass = ''): VNode {
    return (
      <div class="oit-perf-row">
        <div class={`oit-perf-label ${labelClass}`}>
          {label}
          {unit !== null && <span class="oit-perf-unit">{unit}</span>}
        </div>
        {field}
        {after}
      </div>
    );
  }

  /**
   * @param width the box width, px
   * @param options the yellow state and the disabled state of the box
   * @returns the props of every text box but its value and format
   */
  protected boxProps<T>(width: number, options: BoxOptions<T>) {
    return {
      tmpyActive: options.yellow,
      containerStyle: `width: ${width}px;`,
      alignText: 'flex-start' as const,
      disabled: options.disabled ?? this.fieldsDisabled,
      hEventConsumer: this.props.container.hEventConsumer,
      interactionMode: this.props.container.interactionMode,
      errorHandler: () => {},
    };
  }

  protected numberBox(
    format: DataEntryFormat<number>,
    value: Subject<number | null>,
    width: number,
    options: BoxOptions<number> = {},
  ): VNode {
    return (
      <InputField<number>
        dataEntryFormat={format}
        value={value}
        onModified={options.onModified}
        {...this.boxProps(width, options)}
      />
    );
  }

  protected stringBox(
    format: DataEntryFormat<string>,
    value: Subject<string | null>,
    width: number,
    options: BoxOptions<string> = {},
  ): VNode {
    return (
      <InputField<string>
        dataEntryFormat={format}
        value={value}
        onModified={options.onModified}
        {...this.boxProps(width, options)}
      />
    );
  }

  protected windBox(format: DataEntryFormat<WindEntry>, value: Subject<WindEntry | null>, width: number): VNode {
    return <InputField<WindEntry> dataEntryFormat={format} value={value} {...this.boxProps(width, {})} />;
  }

  protected list(
    id: string,
    labels: readonly string[],
    selected: Subject<number | null> | Subject<number>,
    width = 230,
    disabled: Subscribable<boolean> = this.fieldsDisabled,
  ): VNode {
    return (
      <DropdownMenu
        idPrefix={`${this.props.uiService.captOrFo}_OIT_${this.pageId}_${id}`}
        values={ArraySubject.create([...labels])}
        selectedIndex={selected as Subject<number | null>}
        freeTextAllowed={false}
        containerStyle={`width: ${width}px;`}
        alignLabels="flex-start"
        // The field of a list without selection shows one dash per digit: as many as the box holds next to its arrow
        numberOfDigitsForInputField={Math.floor((width - LIST_ARROW_AND_FRAMES_WIDTH) / FIELD_DIGIT_WIDTH)}
        hEventConsumer={this.props.container.hEventConsumer}
        interactionMode={this.props.container.interactionMode}
        disabled={disabled}
      />
    );
  }

  protected value(text: Subscribable<string> | string, extraClass = ''): VNode {
    return <span class={`oit-perf-value ${extraClass}`}>{text}</span>;
  }

  /**
   * @param pick the text of the results
   * @returns the text, empty without results
   */
  protected resultText(pick: (results: R) => string): Subscribable<string> {
    return this.tracked(this.results.map((r) => (r !== null ? pick(r) : '')));
  }

  /**
   * The ERROR list: the missing parameters before a computation, then the errors of the computation.
   * @param missingParameters the missing parameters of the entries
   * @param computation the last computation, null before one
   * @returns the lines of the list
   */
  protected errorLinesOf(
    missingParameters: Subscribable<string[]>,
    computation: Subscribable<{ readonly errors: string[] } | null>,
  ): MappedSubject<[string[], { readonly errors: string[] } | null], string[]> {
    return MappedSubject.create(
      ([missing, last]) => (last !== null ? last.errors : missingParameterErrors(missing)),
      missingParameters,
      computation,
    );
  }

  /**
   * Empties an element the page draws its lines into.
   * @param element the element
   */
  protected static clear(element: HTMLElement): void {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  /**
   * Shows the ERROR list, one "***" line per error.
   * @param ref the list element
   * @param lines the errors
   */
  protected showErrorLines(ref: NodeReference<HTMLDivElement>, lines: readonly string[]): void {
    const list = ref.getOrDefault();
    if (!list) {
      return;
    }
    OitPerfPageBase.clear(list);
    for (const line of lines) {
      FSComponent.render(
        <div class="oit-perf-error-line">
          <span class="oit-perf-error-stars">***</span>
          <span>{line}</span>
        </div>,
        list,
      );
    }
  }

  /**
   * The first row of the airport panel of T.O PERF and LDG PERF: the airport name, the airport (another one can be
   * entered) and, for a SINGLE RWY COMPUTATION, the runway list.
   * @param selection the airport and runway of the page
   * @param airportFromSts the airport comes from FLT OPS STS (yellow)
   * @param onAirportEntered the crew enters an airport
   * @param withRunwayList whether the row has the RWY list
   * @returns the row
   */
  protected renderAirportRow(
    selection: OitPerfRunwaySelection,
    airportFromSts: Subscribable<boolean>,
    onAirportEntered: (icao: string) => void,
    withRunwayList = true,
  ): VNode {
    return (
      <div class="oit-perf-row">
        <span class="oit-perf-text" style="width: 270px; font-size: 22px;">
          {this.tracked(selection.airport.map((a) => a?.name ?? ''))}
        </span>
        <DropdownMenu
          idPrefix={`${this.props.uiService.captOrFo}_OIT_${this.pageId}_airport${withRunwayList ? '' : 'Multiple'}`}
          values={selection.airportIdents}
          selectedIndex={selection.airportIndex}
          freeTextAllowed
          onModified={(index, text) => {
            if (index === -1 && /^[A-Z0-9]{4}$/.test(text)) {
              onAirportEntered(text);
            }
          }}
          containerStyle="width: 150px;"
          alignLabels="flex-start"
          numberOfDigitsForInputField={4}
          tmpyActive={airportFromSts}
          hEventConsumer={this.props.container.hEventConsumer}
          interactionMode={this.props.container.interactionMode}
        />
        {withRunwayList ? (
          <span class="oit-perf-text" style="padding-left: 40px;">
            RWY
          </span>
        ) : null}
        {withRunwayList ? (
          <DropdownMenu
            idPrefix={`${this.props.uiService.captOrFo}_OIT_${this.pageId}_runway`}
            values={selection.runwayIdents}
            selectedIndex={selection.runwayIndex}
            freeTextAllowed={false}
            onModified={(index) => selection.selectRunway(index)}
            containerStyle="width: 180px;"
            alignLabels="flex-start"
            numberOfDigitsForInputField={4}
            hEventConsumer={this.props.container.hEventConsumer}
            interactionMode={this.props.container.interactionMode}
          />
        ) : null}
      </div>
    );
  }

  /**
   * The tabs above a panel.
   * @param tabs each tab: its label, whether it is the active one and what a click does
   * @returns the tabs
   */
  protected renderTabs(
    tabs: readonly {
      readonly label: string | VNode;
      readonly active: Subscribable<boolean>;
      readonly onClick: () => void;
    }[],
  ): VNode {
    return (
      <div class="oit-perf-tabs">
        {tabs.map((tab) => (
          <div ref={this.clickRef(tab.onClick)} class={{ 'oit-perf-tab': true, active: tab.active }}>
            {/* A text child becomes HTML: the shortcut <F2> would be an element, not text */}
            {typeof tab.label === 'string' ? tab.label.replace(/</g, '&lt;').replace(/>/g, '&gt;') : tab.label}
          </div>
        ))}
      </div>
    );
  }

  /**
   * The SINGLE RWY COMPUTATION and MULTIPLE RWY COMPUTATION tabs of the airport panel.
   * @param entries the runway computations of the application
   * @returns the tabs
   */
  protected renderRunwayComputationTabs(entries: RunwayComputationEntries): VNode {
    const mode = entries.computationMode;
    return this.renderTabs([
      {
        label: 'SINGLE RWY COMPUTATION <F2>',
        active: this.tracked(mode.map((m) => m === 'single')),
        onClick: () => mode.set('single'),
      },
      {
        label: 'MULTIPLE RWY COMPUTATION <Ctrl F2>',
        active: this.tracked(mode.map((m) => m === 'multiple')),
        onClick: () => mode.set('multiple'),
      },
    ]);
  }

  /**
   * The MULTIPLE RWY COMPUTATION panel: the airport and the runway table, where the crew ticks the runways to compute.
   * @param selection the airport and runways of the page
   * @param entries the runway computations of the application
   * @param airportFromSts the airport comes from FLT OPS STS (yellow)
   * @param onAirportEntered the crew enters an airport
   * @param columns the columns of the table after RWY
   * @param after what follows the table
   * @returns the panel
   */
  protected renderMultipleRunwayPanel(
    selection: OitPerfRunwaySelection,
    entries: RunwayComputationEntries,
    airportFromSts: Subscribable<boolean>,
    onAirportEntered: (icao: string) => void,
    columns: readonly RunwayTableColumn[],
    after?: VNode,
  ): VNode {
    const tableRef = FSComponent.createRef<HTMLDivElement>();
    const toggle = (ident: string) => {
      const ticked = entries.multipleRunways.get();
      entries.multipleRunways.set(ticked.includes(ident) ? ticked.filter((i) => i !== ident) : [...ticked, ident]);
    };
    const showRows = () => {
      const table = tableRef.getOrDefault();
      if (!table) {
        return;
      }
      OitPerfPageBase.clear(table);
      const ticked = entries.multipleRunways.get();
      for (const runway of selection.airport.get()?.runways ?? []) {
        const isTicked = ticked.includes(runway.ident);
        const rowRef = FSComponent.createRef<HTMLDivElement>();
        FSComponent.render(
          <div ref={rowRef} class={{ 'oit-perf-rwy-table-row': true, ticked: isTicked }}>
            <div class="oit-perf-rwy-tick-cell">
              <div class="oit-perf-rwy-tick">
                {isTicked ? (
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path d={TICK_PATH} stroke="#000000" stroke-width="4" fill="none" />
                  </svg>
                ) : null}
              </div>
            </div>
            <div style="width: 80px;">{runway.ident}</div>
            {columns.map((column) => (
              <div style={`width: ${column.width}px;`}>{column.value(runway)}</div>
            ))}
          </div>,
          table,
        );
        rowRef.getOrDefault()?.addEventListener('click', () => toggle(runway.ident));
      }
    };
    this.subs.push(selection.airport.sub(showRows), entries.multipleRunways.sub(showRows));
    this.drawnAfterRender.push(showRows);
    return (
      <div class="oit-perf-panel">
        {this.renderAirportRow(selection, airportFromSts, onAirportEntered, false)}
        <div class="oit-perf-rwy-table">
          <div class="oit-perf-rwy-table-row header">
            <div class="oit-perf-rwy-tick-cell" />
            <div style="width: 80px;">RWY</div>
            {columns.map((column) => (
              <div style={`width: ${column.width}px;`}>
                {column.label}
                <span class="oit-perf-unit">{column.unit}</span>
              </div>
            ))}
          </div>
          <div ref={tableRef} class="oit-perf-rwy-table-body" />
        </div>
        {after}
      </div>
    );
  }

  /**
   * The RWY list of the multiple results: the result of each runway between brackets, colour-coded.
   * @param id the id of the list in the page
   * @param items the items of the list
   * @param shownRunway the runway of the results shown
   * @param onSelected the crew shows the results of another runway
   * @returns the list
   */
  protected renderRunwayResultList(
    id: string,
    items: Subscribable<readonly RunwayResultItem[]>,
    shownRunway: Subscribable<string | null>,
    onSelected: (ident: string) => void,
  ): VNode {
    const idPrefix = `${this.props.uiService.captOrFo}_OIT_${this.pageId}_${id}`;
    const labels = ArraySubject.create<string>([]);
    const selectedIndex = Subject.create<number | null>(null);
    // The list draws its items when its values change: the page colours them right after
    const colourItems = (list: readonly RunwayResultItem[]) =>
      list.forEach((item, i) => {
        const element = document.getElementById(`${idPrefix}_${i}`);
        if (element) {
          element.classList.remove('green', 'amber', 'red');
          element.classList.add(item.colour);
        }
      });
    this.drawnAfterRender.push(() => colourItems(items.get()));
    this.subs.push(
      items.sub((list) => {
        labels.set(list.map((item) => item.label));
        colourItems(list);
      }, true),
      MappedSubject.create(
        ([list, shown]) => {
          const index = list.findIndex((item) => item.ident === shown);
          selectedIndex.set(index >= 0 ? index : null);
        },
        items,
        shownRunway,
      ),
    );
    return (
      <DropdownMenu
        idPrefix={idPrefix}
        values={labels}
        selectedIndex={selectedIndex}
        freeTextAllowed={false}
        onModified={(index) => {
          const item = index !== null ? items.get()[index] : undefined;
          if (item) {
            onSelected(item.ident);
          }
        }}
        containerStyle="width: 190px;"
        alignLabels="flex-start"
        numberOfDigitsForInputField={9}
        hEventConsumer={this.props.container.hEventConsumer}
        interactionMode={this.props.container.interactionMode}
      />
    );
  }

  /**
   * The reminder area of the AIRCRAFT STATUS panel: the MEL and CDL items in yellow (from the eLogbook), the crew
   * entries in cyan.
   * @returns the area
   */
  protected renderAircraftStatusReminder(): VNode {
    const linesRef = FSComponent.createRef<HTMLDivElement>();
    const show = () => {
      const element = linesRef.getOrDefault();
      if (!element) {
        return;
      }
      OitPerfPageBase.clear(element);
      const lines = reminderLines(this.aircraftStatus.get(), this.application);
      const normal = lines.length === 1 && !lines[0].title;
      element.classList.toggle('normal', normal);
      for (const line of lines) {
        const colour = line.title ? 'title' : line.byCrew ? 'cyan' : normal ? 'white' : 'yellow';
        FSComponent.render(<div class={`oit-perf-reminder-line ${colour}`}>{line.text}</div>, element);
      }
    };
    this.subs.push(this.aircraftStatus.sub(show));
    this.drawnAfterRender.push(show);
    return <div ref={linesRef} class="oit-perf-reminder" />;
  }

  /** @returns the ACFT STS and SYNCHRO LOGBOOK buttons of the bottom bar */
  protected renderAircraftStatusButtons(): VNode[] {
    return [
      <Button label="ACFT STS <F5>" onClick={() => this.aircraftStatusShown.set(true)} />,
      <Button label="SYNCHRO LOGBOOK" onClick={() => this.synchroLogbook()} />,
    ];
  }

  /**
   * @param details whether the line lists the items
   * @returns the MEL and CDL items the computation does not take into account, empty when it takes everything
   */
  protected notInComputationText(details = false): Subscribable<string> {
    return this.tracked(
      this.aircraftStatus.map((status) => {
        const items = itemsNotInComputation(status, this.application);
        if (items.length === 0) {
          return '';
        }
        return details
          ? `NOT IN COMPUTATION (NO MEL/CDL PENALTY IN THE PERFORMANCE DATABASE), APPLY THE PENALTIES BY HAND: ${items.join(', ')}`
          : `${items.length} ITEM${items.length > 1 ? 'S' : ''} NOT IN COMPUTATION, SEE ACFT STS`;
      }),
    );
  }

  /**
   * A list of the AIRCRAFT STATUS panel: one row per item; a click selects the item for DELETE.
   * @param pick the items of the list
   * @param withMissing the CDL list shows the number of missing parts
   * @returns the list
   */
  private renderStatusItemList(
    pick: (status: FltOpsAircraftStatus) => readonly AircraftStatusItem[],
    withMissing: boolean,
  ): VNode {
    const listRef = FSComponent.createRef<HTMLDivElement>();
    const show = () => {
      const element = listRef.getOrDefault();
      if (!element) {
        return;
      }
      OitPerfPageBase.clear(element);
      const selected = this.selectedStatusItem.get();
      for (const item of pick(this.aircraftStatus.get())) {
        const rowRef = FSComponent.createRef<HTMLDivElement>();
        FSComponent.render(
          <div ref={rowRef} class={{ 'oit-perf-status-item': true, selected: item.ref === selected }}>
            {`${aircraftStatusItemText(item)}${withMissing ? '   (1 MISSING)' : ''}`}
          </div>,
          element,
        );
        rowRef.getOrDefault()?.addEventListener('click', () => this.selectedStatusItem.set(item.ref));
      }
    };
    this.subs.push(this.aircraftStatus.sub(show), this.selectedStatusItem.sub(show));
    this.drawnAfterRender.push(show);
    return <div ref={listRef} class="oit-perf-status-list" />;
  }

  /**
   * The buttons of a subpanel of the AIRCRAFT STATUS panel. ADD is greyed: the performance databases of the laptops
   * have no list of inoperative systems or missing parts with a penalty.
   * @param kind the MEL or CDL items
   * @returns the buttons
   */
  private renderStatusItemButtons(kind: 'melItems' | 'cdlItems'): VNode {
    const deleteDisabled = this.tracked(
      MappedSubject.create(
        ([status, selected]) => selected === null || !status[kind].some((item) => item.ref === selected),
        this.aircraftStatus,
        this.selectedStatusItem,
      ),
    );
    const update = (status: FltOpsAircraftStatus) => this.session.aircraftStatus.set(status);
    return (
      <div class="fr" style="justify-content: center; padding: 4px;">
        <Button label="ADD" onClick={() => {}} disabled={Subject.create(true)} />
        <div style="width: 10px;" />
        <Button
          label="DELETE"
          disabled={deleteDisabled}
          onClick={() => {
            const selected = this.selectedStatusItem.get();
            if (selected !== null) {
              update(deleteAircraftStatusItem(this.aircraftStatus.get(), selected));
              this.selectedStatusItem.set(null);
            }
          }}
        />
        <div style="width: 10px;" />
        <Button label="DELETE ALL" onClick={() => update({ ...this.aircraftStatus.get(), [kind]: [] })} />
      </div>
    );
  }

  /**
   * The AIRCRAFT STATUS panel (ACFT STS): SYNCHRO LOGBOOK, the MEL items, the CDL items with the number of negligible
   * items (T.O PERF, LDG PERF), the ECAM alerts (LDG PERF: empty and disabled), and the items the computation does not
   * take into account.
   * @returns the panel, over the page
   */
  protected renderAircraftStatusPanel(): VNode {
    const withCdl = this.application !== 'LOADSHEET';
    return (
      <div class={{ 'oit-perf-acft-sts': true, hidden: this.tracked(this.aircraftStatusShown.map((s) => !s)) }}>
        <div class="oit-perf-panel-title">AIRCRAFT STATUS</div>
        <div class="fr" style="padding: 6px;">
          <Button label="SYNCHRO LOGBOOK" onClick={() => this.synchroLogbook()} />
        </div>
        <div class="oit-perf-panel oit-perf-status-subpanel grow">
          <div class="oit-perf-panel-title">MEL Items</div>
          {this.renderStatusItemList((status) => status.melItems, false)}
          {this.renderStatusItemButtons('melItems')}
        </div>
        {withCdl ? (
          <div class="oit-perf-panel oit-perf-status-subpanel grow">
            <div class="oit-perf-panel-title">CDL Items</div>
            <div class="oit-perf-row">
              <span class="oit-perf-text">Number of negligible items:</span>
              {this.numberBox(this.negligibleItemsFormat, this.negligibleItems, 70, {
                onModified: (n) =>
                  this.session.aircraftStatus.set({
                    ...this.aircraftStatus.get(),
                    negligibleCdlItems: n ?? 0,
                    negligibleCdlItemsByCrew: true,
                  }),
              })}
            </div>
            {this.renderStatusItemList((status) => status.cdlItems, true)}
            {this.renderStatusItemButtons('cdlItems')}
          </div>
        ) : null}
        {this.application === 'LDG PERF' ? (
          <div class="oit-perf-panel oit-perf-status-subpanel" style="height: 60px;">
            <div class="oit-perf-panel-title disabled">ECAM Alerts</div>
          </div>
        ) : null}
        <div class="oit-perf-status-note">{this.notInComputationText(true)}</div>
        <div class="fr jend" style="padding: 6px;">
          <Button label="OK" onClick={() => this.aircraftStatusShown.set(false)} />
        </div>
      </div>
    );
  }

  /**
   * The page of an application the FLT OPS STS page does not permit to start.
   * @param application the application name
   * @param missingFields the missing FLT OPS STS fields
   * @returns the page
   */
  protected renderNotStarted(application: string, missingFields: readonly string[]): VNode {
    return (
      <div class="oit-perf-page">
        <div class="oit-perf-not-available">
          <div>{application} CANNOT BE STARTED</div>
          <div style="font-size: 22px; padding-top: 16px;">FILL IN ON FLT OPS STS: {missingFields.join(', ')}</div>
        </div>
      </div>
    );
  }

  public destroy(): void {
    for (const target of this.clickTargets) {
      target.ref.getOrDefault()?.removeEventListener('click', target.handler);
    }
    // Destroy all subscriptions to remove all references to this instance.
    for (const s of this.subs) {
      s.destroy();
    }

    super.destroy();
  }
}
