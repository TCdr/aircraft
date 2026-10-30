//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  DisplayComponent,
  FSComponent,
  MappedSubject,
  Subject,
  SubscribableMapFunctions,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';
import { AbstractOitFltOpsPageProps } from '../../../OIT';
import { Button, ButtonMenuItem } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { AirportFormat } from '../../../../MFD/pages/common/DataEntryFormats';
import { ChartsSession, CLIPBOARD_TAB, ChartsTab } from '../../../System/Charts/ChartsSession';
import { CHART_TABS, chartRunwayText, chartTypeText, MAX_AIRPORTS } from '../../../System/Charts/TerminalChartCatalog';
import { ChartRef } from '../../../System/Charts/ChartsClipboard';
import { PaneRule, PaneScope } from '../Shared/PaneLayout';
import { OitTerminalChartViewer } from './OitTerminalChartViewer';
import './oit-charts.scss';

interface OitFltOpsTerminalChartsProps extends AbstractOitFltOpsPageProps {}

/**
 * The panes with an explicit height, outermost first: the page never depends on the browser shrinking flex items, so a
 * long list cannot push the keys off the screen.
 */
const CHARTS_PANE_RULES: PaneRule[] = [
  { selector: '.oit-charts', rule: 'to-page-bottom' },
  { selector: '.oit-charts-body', rule: 'fill' },
  { selector: '.oit-charts-left', rule: 'same' },
  { selector: '.oit-charts-list', rule: 'same' },
  { selector: '.oit-charts-right', rule: 'same' },
  { selector: '.oit-charts-viewer', rule: 'fill' },
];

/** The panes that scroll, with the click-operated scroll bar */
const CHARTS_SCROLLERS = ['.oit-charts-list'];

const AIRPORT_KEY_SLOTS: number[] = [];
for (let slot = 0; slot < MAX_AIRPORTS; slot++) {
  AIRPORT_KEY_SLOTS.push(slot);
}

/** The tab bar: the chart groups, then the charts the crew prepared */
const TAB_KEYS: ChartsTab[] = (CHART_TABS as readonly ChartsTab[]).concat([CLIPBOARD_TAB]);

/**
 * The CHARTS application: the terminal charts of the airports of the flight and of those the crew adds. An airport key
 * lists its charts by group, a click on a chart shows it, and the buttons zoom and move it. The state lives in the
 * laptop, so the application is as the crew left it when its key of the switching bar is clicked again.
 */
export class OitFltOpsTerminalCharts extends DisplayComponent<OitFltOpsTerminalChartsProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  private readonly session: ChartsSession = this.props.container.laptop.charts;

  private readonly rootRef = FSComponent.createRef<HTMLDivElement>();
  private readonly listRef = FSComponent.createRef<HTMLDivElement>();
  private readonly viewerRef = FSComponent.createRef<OitTerminalChartViewer>();

  private paneScope: PaneScope | null = null;

  private lastListKey = '';

  /** The airport the crew typed: it joins the selection as soon as it is entered */
  private readonly typedAirport = Subject.create<string | null>(null);

  private readonly airportKeyLabels = AIRPORT_KEY_SLOTS.map((slot) =>
    this.session.airports.map((airports) => airports[slot] ?? ''),
  );

  private readonly airportKeyVisible = AIRPORT_KEY_SLOTS.map((slot) =>
    this.session.airports.map((airports) => slot < airports.length),
  );

  private readonly airportKeySelected = AIRPORT_KEY_SLOTS.map((slot) =>
    MappedSubject.create(
      ([airports, airport]) => airports[slot] === airport,
      this.session.airports,
      this.session.airport,
    ),
  );

  /** REMOVE applies to the airports the crew added, not to those of the flight plan */
  private readonly cannotRemoveAirport = MappedSubject.create(
    ([airport]) => !this.session.isManualAirport(airport),
    this.session.airport,
    this.session.airports,
  );

  private readonly homeAvailable = this.session.atHome.map(SubscribableMapFunctions.not());

  private readonly preparedLabel = this.session.clipboard.charts.map((charts) =>
    charts.length > 0 ? `PREPARED ${charts.length}` : 'PREPARED',
  );

  private readonly tabSelected = TAB_KEYS.map((tab) => this.session.tab.map((selected) => selected === tab));

  private readonly runwayLabel = this.session.runway.map((runway) => (runway === null ? 'RWY ALL' : `RWY ${runway}`));

  private readonly runwayItems = this.session.runwaysOfTab.map((runways): ButtonMenuItem[] =>
    ['ALL'].concat(runways).map((runway) => ({
      label: runway,
      action: () => this.session.setRunway(runway === 'ALL' ? null : runway),
    })),
  );

  private readonly cannotPickRunway = this.session.runwaysOfTab.map((runways) => runways.length === 0);

  private readonly clipboardItems = MappedSubject.create(
    ([chart, held, offered]): ButtonMenuItem[] => {
      const clipboard = this.session.clipboard;
      const prepared = chart !== null && clipboard.contains(chart.guid);
      return [
        {
          label: 'Prepare chart',
          disabled: chart === null || prepared,
          action: () => {
            const open = this.session.chart.get();
            if (open !== null) {
              clipboard.prepare(open);
            }
          },
        },
        {
          label: 'Remove chart',
          disabled: !prepared,
          action: () => {
            const open = this.session.chart.get();
            if (open !== null) {
              clipboard.remove(open.guid);
            }
          },
        },
        { label: 'Clear all', disabled: held.length === 0, action: () => clipboard.clear() },
        { label: 'Send to other laptop', disabled: !clipboard.canSend(), action: () => clipboard.send() },
        {
          label: offered.length > 0 ? `Import ${offered.length} chart${offered.length > 1 ? 's' : ''}` : 'Import',
          disabled: !clipboard.canImport(),
          action: () => clipboard.importOffered(),
        },
      ];
    },
    this.session.chart,
    this.session.clipboard.charts,
    this.session.clipboard.offered,
    this.session.clipboard.onNetwork,
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.session.start();

    this.props.uiService.registerPageFunctions({
      home: { run: () => this.session.home(), available: this.homeAvailable },
    });

    this.subs.push(
      ...this.airportKeyLabels,
      ...this.airportKeyVisible,
      ...this.airportKeySelected,
      ...this.tabSelected,
      this.cannotRemoveAirport,
      this.homeAvailable,
      this.preparedLabel,
      this.runwayLabel,
      this.runwayItems,
      this.cannotPickRunway,
      this.clipboardItems,
      this.session.index.sub(() => this.rebuildList()),
      this.session.listedCharts.sub(() => this.rebuildList()),
      this.session.tab.sub(() => this.rebuildList()),
      this.session.chart.sub(() => this.rebuildList()),
      this.session.clipboard.charts.sub(() => this.rebuildList()),
    );
    this.paneScope = new PaneScope(this.rootRef.instance, CHARTS_PANE_RULES, CHARTS_SCROLLERS);
    this.rebuildList();
  }

  public destroy(): void {
    this.paneScope?.destroy();
    // The page closes with the viewer: it gives its chart view back to the sim
    this.viewerRef.getOrDefault()?.destroy();
    // Destroy all subscriptions to remove all references to this instance.
    for (const s of this.subs) {
      s.destroy();
    }

    super.destroy();
  }

  /** Draws the list again: the charts of the tab, the prepared charts, or the word that says why there are none */
  private rebuildList(): void {
    const list = this.listRef.getOrDefault();
    if (list === null) {
      return;
    }
    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }

    const tab = this.session.tab.get();
    const index = this.session.index.get();
    const openGuid = this.session.chart.get()?.guid ?? null;
    const icao = this.session.airport.get() ?? '';
    // A list that is another list (another airport, tab or runway) starts at its top
    const key = `${tab}/${icao}/${this.session.runway.get() ?? ''}/${index.status}`;
    if (key !== this.lastListKey) {
      this.lastListKey = key;
      list.scrollTop = 0;
    }

    if (tab === CLIPBOARD_TAB) {
      const prepared = this.session.clipboard.charts.get();
      if (prepared.length === 0) {
        this.addMessage(list, 'NO CHART PREPARED', false);
      }
      for (const chart of prepared) {
        this.addRow(list, chart, chart.icao, openGuid);
      }
    } else if (index.status === 'none') {
      this.addMessage(list, 'SELECT AN AIRPORT', false);
    } else if (index.status === 'loading') {
      this.addMessage(list, 'LOADING...', false);
    } else if (index.status === 'error') {
      this.addMessage(list, 'CHARTS NOT AVAILABLE', true, () => this.session.retry());
    } else if (index.status === 'empty') {
      this.addMessage(list, `NO CHART FOR ${icao}`, false);
    } else {
      const charts = this.session.listedCharts.get();
      if (charts.length === 0) {
        this.addMessage(list, `NO ${tab} CHART`, false);
      }
      for (const chart of charts) {
        this.addRow(
          list,
          { icao, guid: chart.guid, name: chart.name },
          `${chartTypeText(chart.type)} ${chartRunwayText(chart)}`.trim(),
          openGuid,
        );
      }
    }
    this.paneScope?.update();
  }

  private addRow(list: HTMLElement, chart: ChartRef, note: string, openGuid: string | null): void {
    const row = document.createElement('div');
    row.className = `oit-charts-row${chart.guid === openGuid ? ' selected' : ''}`;
    const name = document.createElement('div');
    name.className = 'oit-charts-row-name';
    name.textContent = chart.name;
    row.appendChild(name);
    const noteElement = document.createElement('div');
    noteElement.className = 'oit-charts-row-note';
    noteElement.textContent = note;
    row.appendChild(noteElement);
    row.addEventListener('click', () => this.session.openChart(chart));
    list.appendChild(row);
  }

  private addMessage(list: HTMLElement, text: string, amber: boolean, retry?: () => void): void {
    const message = document.createElement('div');
    message.className = `oit-charts-message${amber ? ' amber' : ''}`;
    const line = document.createElement('div');
    line.textContent = text;
    message.appendChild(line);
    if (retry !== undefined) {
      const button = document.createElement('div');
      button.className = 'mfd-button';
      button.textContent = 'RETRY';
      button.addEventListener('click', retry);
      message.appendChild(button);
    }
    list.appendChild(message);
  }

  render(): VNode {
    return (
      <div ref={this.rootRef} class="oit-page-container oit-charts">
        <div class="oit-charts-bar">
          <div class="oit-charts-caption">AIRPORT</div>
          {AIRPORT_KEY_SLOTS.map((slot) => (
            <Button
              label={this.airportKeyLabels[slot]}
              visible={this.airportKeyVisible[slot]}
              selected={this.airportKeySelected[slot]}
              onClick={() => {
                const icao = this.session.airports.get()[slot];
                if (icao !== undefined) {
                  this.session.selectAirport(icao);
                }
              }}
              buttonStyle="width: 94px;"
            />
          ))}
          <div class="oit-charts-spacer" />
          <div class="oit-charts-add-caption">ADD</div>
          <InputField<string>
            dataEntryFormat={new AirportFormat()}
            value={this.typedAirport}
            onModified={(value) => {
              if (value !== null) {
                this.session.addAirport(value);
              }
              this.typedAirport.set(null);
            }}
            containerStyle="width: 130px;"
            alignText="center"
            hEventConsumer={this.props.container.hEventConsumer}
            interactionMode={this.props.container.interactionMode}
            errorHandler={() => {}}
          />
          <Button
            label="REMOVE"
            disabled={this.cannotRemoveAirport}
            onClick={() => {
              const icao = this.session.airport.get();
              if (icao !== null) {
                this.session.removeAirport(icao);
              }
            }}
          />
        </div>
        <div class="oit-charts-bar">
          {TAB_KEYS.map((tab, i) => (
            <Button
              label={tab === CLIPBOARD_TAB ? this.preparedLabel : tab}
              selected={this.tabSelected[i]}
              onClick={() => this.session.selectTab(tab)}
              buttonStyle={tab === CLIPBOARD_TAB ? 'min-width: 150px;' : 'min-width: 84px;'}
            />
          ))}
          <div style="width: 10px;" />
          <Button
            label={this.runwayLabel}
            idPrefix="oit-charts-runway"
            menuItems={this.runwayItems}
            disabled={this.cannotPickRunway}
            onClick={() => {}}
            buttonStyle="white-space: nowrap; min-width: 150px;"
          />
          <div class="oit-charts-spacer" />
          <Button
            label="CLIPBOARD"
            idPrefix="oit-charts-clipboard"
            menuItems={this.clipboardItems}
            dropdownMenuRightAligned
            onClick={() => {}}
            buttonStyle="white-space: nowrap;"
          />
        </div>
        <div class="oit-charts-body">
          <div class="oit-charts-left">
            <div ref={this.listRef} class="oit-charts-list" />
          </div>
          <OitTerminalChartViewer ref={this.viewerRef} session={this.session} />
        </div>
      </div>
    );
  }
}
