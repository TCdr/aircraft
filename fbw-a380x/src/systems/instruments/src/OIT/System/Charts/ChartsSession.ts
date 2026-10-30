// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ChartImageSupplier, MappedSubject, Subject, Subscribable } from '@microsoft/msfs-sdk';
import {
  addManualAirport,
  airportList,
  ChartTab,
  ChartValidity,
  chartsOfTab,
  chartValidity,
  filterByRunway,
  normalizeIcao,
  removeManualAirport,
  runwayChoices,
} from './TerminalChartCatalog';
import { TerminalChart, TerminalChartPage, TerminalChartSource } from './TerminalChartSource';
import { ChartViewState, FIT_VIEW } from './TerminalChartViewport';
import { ChartsClipboard, ChartRef } from './ChartsClipboard';

/** The tab of the saved charts of the clipboard, beside the tabs of the terminal charts */
export const CLIPBOARD_TAB = 'CLIP';

export type ChartsTab = ChartTab | typeof CLIPBOARD_TAB;

/** Design choice: a page opens on the departure charts, the first thing the crew looks for */
export const DEFAULT_TAB: ChartsTab = 'DEP';

/** The charts of the airport shown, as far as the service has answered */
export type ChartIndexView =
  | { readonly status: 'none' }
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'empty' }
  | { readonly status: 'loaded'; readonly charts: readonly TerminalChart[] };

/** The pages of the chart shown, as far as the service has answered */
export type ChartPagesView =
  | { readonly status: 'none' }
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'loaded'; readonly pages: readonly TerminalChartPage[] };

/** Design choice: the airports and charts remembered while the laptop runs; the least recently used goes first */
const MAX_CACHED_INDEXES = 10;
const MAX_CACHED_CHART_PAGES = 50;

/** A bounded memory in which the least recently used entry is dropped first */
class RecentCache<V> {
  private readonly keys: string[] = [];

  private readonly values: Record<string, V> = {};

  constructor(private readonly capacity: number) {}

  public get(key: string): V | undefined {
    if (!(key in this.values)) {
      return undefined;
    }
    this.keys.splice(this.keys.indexOf(key), 1);
    this.keys.push(key);
    return this.values[key];
  }

  public set(key: string, value: V): void {
    if (key in this.values) {
      this.keys.splice(this.keys.indexOf(key), 1);
    }
    this.keys.push(key);
    this.values[key] = value;
    while (this.keys.length > this.capacity) {
      delete this.values[this.keys.shift() as string];
    }
  }

  public delete(key: string): void {
    if (key in this.values) {
      this.keys.splice(this.keys.indexOf(key), 1);
      delete this.values[key];
    }
  }

  public clear(): void {
    this.keys.length = 0;
    for (const key of Object.keys(this.values)) {
      delete this.values[key];
    }
  }
}

/**
 * The terminal charts of one laptop: the airports, what the crew selected and what the chart service answered. It
 * lives as long as the laptop runs, so the application is as the crew left it when it is opened again.
 */
export class ChartsSession {
  private readonly _started = Subject.create(false);
  /** Whether the crew has opened the application since the laptop started */
  public readonly started = this._started as Subscribable<boolean>;

  private readonly _validity = Subject.create<ChartValidity | null>(null);
  /** The validity of the chart database, known once an airport index has been read; none before */
  public readonly validity = this._validity as Subscribable<ChartValidity | null>;

  private readonly _manualAirports = Subject.create<string[]>([]);

  /** The airports of the selection: the departure and destination of the FLT OPS STS page, then the added ones */
  public readonly airports: Subscribable<string[]>;

  private readonly _airport = Subject.create<string | null>(null);
  public readonly airport = this._airport as Subscribable<string | null>;

  private readonly _index = Subject.create<ChartIndexView>({ status: 'none' });
  public readonly index = this._index as Subscribable<ChartIndexView>;

  private readonly _tab = Subject.create<ChartsTab>(DEFAULT_TAB);
  public readonly tab = this._tab as Subscribable<ChartsTab>;

  private readonly _runway = Subject.create<string | null>(null);
  /** The runway the list is limited to, null for all */
  public readonly runway = this._runway as Subscribable<string | null>;

  private readonly _chart = Subject.create<ChartRef | null>(null);
  /** The chart open in the viewer */
  public readonly chart = this._chart as Subscribable<ChartRef | null>;

  private readonly _pages = Subject.create<ChartPagesView>({ status: 'none' });
  public readonly pages = this._pages as Subscribable<ChartPagesView>;

  private readonly _pageIndex = Subject.create(0);
  public readonly pageIndex = this._pageIndex as Subscribable<number>;

  public readonly view = Subject.create<ChartViewState>(FIT_VIEW);

  /** The charts of the tab for the list, with the runway filter applied */
  public readonly listedCharts: Subscribable<TerminalChart[]>;

  /** The runways the crew can pick for the tab */
  public readonly runwaysOfTab: Subscribable<string[]>;

  /** Whether the application stands as it opens: the first airport, the departure tab, no chart open */
  public readonly atHome: Subscribable<boolean>;

  private readonly indexCache = new RecentCache<TerminalChart[]>(MAX_CACHED_INDEXES);
  private readonly pagesCache = new RecentCache<TerminalChartPage[]>(MAX_CACHED_CHART_PAGES);
  private readonly indexesInFlight: string[] = [];
  private readonly pagesInFlight: string[] = [];

  /** Counts the laptop restarts: an answer that comes after one belongs to a session that is gone */
  private generation = 0;

  /**
   * @param source where the charts come from
   * @param flightPlanFrom the departure airport of the FLT OPS STS page
   * @param flightPlanTo its destination airport
   * @param clipboard the saved charts and their exchange with the other laptop
   */
  constructor(
    private readonly source: TerminalChartSource,
    flightPlanFrom: Subscribable<string | null>,
    flightPlanTo: Subscribable<string | null>,
    public readonly clipboard: ChartsClipboard,
  ) {
    this.airports = MappedSubject.create(
      ([from, to, manual]) => airportList(from, to, manual),
      flightPlanFrom,
      flightPlanTo,
      this._manualAirports,
    );
    this.airports.sub((list) => this.onAirportsChanged(list));

    this.listedCharts = MappedSubject.create(
      ([index, tab, runway]) =>
        index.status === 'loaded' && tab !== CLIPBOARD_TAB
          ? filterByRunway(chartsOfTab(index.charts, tab), runway)
          : [],
      this._index,
      this._tab,
      this._runway,
    );

    this.runwaysOfTab = MappedSubject.create(
      ([index, tab]) =>
        index.status === 'loaded' && tab !== CLIPBOARD_TAB ? runwayChoices(chartsOfTab(index.charts, tab)) : [],
      this._index,
      this._tab,
    );

    this.atHome = MappedSubject.create(
      ([airports, airport, tab, runway, chart]) =>
        chart === null && tab === DEFAULT_TAB && runway === null && airport === (airports[0] ?? null),
      this.airports,
      this._airport,
      this._tab,
      this._runway,
      this._chart,
    );
  }

  /** @returns the supplier of chart images of the gauge, the same one for every viewer */
  public createImageSupplier(): ChartImageSupplier {
    return this.source.createImageSupplier();
  }

  /** The application opens: the first time since the laptop started it reads the charts of the first airport */
  public start(): void {
    if (this._started.get()) {
      return;
    }
    this._started.set(true);
    const first = this.airports.get()[0];
    if (first !== undefined && this._airport.get() === null) {
      this.selectAirport(first);
    }
  }

  private onAirportsChanged(list: string[]): void {
    if (!this._started.get()) {
      return;
    }
    const selected = this._airport.get();
    if (selected === null || list.indexOf(selected) < 0) {
      // The flight plan changed or the crew removed the airport: the first airport of the selection takes over
      if (list.length > 0) {
        this.selectAirport(list[0]);
      } else {
        this.clearAirport();
      }
    }
  }

  private clearAirport(): void {
    this._airport.set(null);
    this._index.set({ status: 'none' });
    this._runway.set(null);
  }

  /** @param icao an airport of the selection: its charts are listed */
  public selectAirport(icao: string): void {
    if (icao !== this._airport.get()) {
      this._runway.set(null);
    }
    this._airport.set(icao);
    this.loadIndex(icao);
  }

  /**
   * @param text an airport the crew typed
   * @returns whether it was added to the selection and selected
   */
  public addAirport(text: string): boolean {
    const icao = normalizeIcao(text);
    if (icao === null) {
      return false;
    }
    if (this.airports.get().indexOf(icao) < 0) {
      this._manualAirports.set(addManualAirport(this._manualAirports.get(), icao));
    }
    if (this.airports.get().indexOf(icao) < 0) {
      return false;
    }
    this.selectAirport(icao);
    return true;
  }

  /** @param icao an airport the crew added: it leaves the selection; the airports of the flight plan stay */
  public removeAirport(icao: string): void {
    this._manualAirports.set(removeManualAirport(this._manualAirports.get(), icao));
  }

  /**
   * @param icao an airport
   * @returns whether the crew added it, so that REMOVE applies to it
   */
  public isManualAirport(icao: string | null): boolean {
    return icao !== null && this._manualAirports.get().indexOf(icao) >= 0;
  }

  /** @param tab the tab to show: the runway filter stays when the tab has that runway */
  public selectTab(tab: ChartsTab): void {
    this._tab.set(tab);
    const runway = this._runway.get();
    if (runway !== null && this.runwaysOfTab.get().indexOf(runway) < 0) {
      this._runway.set(null);
    }
  }

  /** @param runway the runway to limit the list to, null for all */
  public setRunway(runway: string | null): void {
    this._runway.set(runway);
  }

  private loadIndex(icao: string): void {
    const cached = this.indexCache.get(icao);
    if (cached !== undefined) {
      this.showIndex(cached);
      return;
    }
    this._index.set({ status: 'loading' });
    this.requestOnce(
      this.indexesInFlight,
      icao,
      () => this.source.index(icao),
      (charts) => {
        this.indexCache.set(icao, charts);
        this.takeValidity(charts);
        // The crew may have selected another airport while the service answered: that airport shows what it gets
        if (this._airport.get() === icao) {
          this.showIndex(charts);
        }
      },
      () => {
        if (this._airport.get() === icao) {
          this._index.set({ status: 'error' });
        }
      },
    );
  }

  /**
   * Asks the service for a key unless the same question is already on its way; the one answer serves every asker. An
   * answer that comes after reset() belongs to a session that is gone and is dropped.
   * @param inFlight the keys of this kind of question that wait for an answer
   * @param key what is asked for
   * @param ask sends the question
   * @param onAnswer takes the answer
   * @param onFailure takes the failure
   */
  private requestOnce<T>(
    inFlight: string[],
    key: string,
    ask: () => Promise<T>,
    onAnswer: (answer: T) => void,
    onFailure: () => void,
  ): void {
    if (inFlight.indexOf(key) >= 0) {
      return;
    }
    inFlight.push(key);
    const generation = this.generation;
    const stillCurrent = (): boolean => {
      if (generation !== this.generation) {
        return false;
      }
      inFlight.splice(inFlight.indexOf(key), 1);
      return true;
    };
    ask().then(
      (answer) => {
        if (stillCurrent()) {
          onAnswer(answer);
        }
      },
      () => {
        if (stillCurrent()) {
          onFailure();
        }
      },
    );
  }

  private showIndex(charts: TerminalChart[]): void {
    this._index.set(charts.length === 0 ? { status: 'empty' } : { status: 'loaded', charts });
  }

  /**
   * Design choice: the validity belongs to the chart database, not to an airport: the first index that carries dates
   * gives it, and it stays for the laptop run.
   * @param charts the charts of an airport index
   */
  private takeValidity(charts: readonly TerminalChart[]): void {
    if (this._validity.get() === null) {
      this._validity.set(chartValidity(charts));
    }
  }

  /** RETRY: the service did not answer: ask again for what failed */
  public retry(): void {
    if (this._pages.get().status === 'error') {
      const chart = this._chart.get();
      if (chart !== null) {
        this.pagesCache.delete(chart.guid);
        this.loadPages(chart.guid);
      }
      return;
    }
    const icao = this._airport.get();
    if (icao !== null) {
      this.indexCache.delete(icao);
      this.loadIndex(icao);
    }
  }

  /** @param chart the chart to show: its first page */
  public openChart(chart: ChartRef): void {
    this._chart.set(chart);
    this._pageIndex.set(0);
    this.view.set(FIT_VIEW);
    this.loadPages(chart.guid);
  }

  /** The chart in the viewer is closed */
  public closeChart(): void {
    this._chart.set(null);
    this._pages.set({ status: 'none' });
    this._pageIndex.set(0);
    this.view.set(FIT_VIEW);
  }

  /** @param pageIndex the page of the open chart to show; a new page opens whole */
  public setPage(pageIndex: number): void {
    const pages = this._pages.get();
    if (pages.status !== 'loaded' || pageIndex < 0 || pageIndex >= pages.pages.length) {
      return;
    }
    if (pageIndex !== this._pageIndex.get()) {
      this._pageIndex.set(pageIndex);
      this.view.set(FIT_VIEW);
    }
  }

  private loadPages(guid: string): void {
    const cached = this.pagesCache.get(guid);
    if (cached !== undefined) {
      this._pages.set({ status: 'loaded', pages: cached });
      return;
    }
    this._pages.set({ status: 'loading' });
    this.requestOnce(
      this.pagesInFlight,
      guid,
      () => this.source.pages(guid),
      (pages) => {
        this.pagesCache.set(guid, pages);
        if (this._chart.get()?.guid === guid) {
          this._pages.set({ status: 'loaded', pages });
        }
      },
      () => {
        if (this._chart.get()?.guid === guid) {
          this._pages.set({ status: 'error' });
        }
      },
    );
  }

  /** HOME: the application stands as it opens, with the charts of the first airport */
  public home(): void {
    this.closeChart();
    this._tab.set(DEFAULT_TAB);
    this._runway.set(null);
    const first = this.airports.get()[0];
    if (first !== undefined) {
      this.selectAirport(first);
    } else {
      this.clearAirport();
    }
  }

  /** The laptop stops: the application starts again at the next start, and the validity is not shown until then */
  public reset(): void {
    this.generation++;
    this.indexesInFlight.length = 0;
    this.pagesInFlight.length = 0;
    this.indexCache.clear();
    this.pagesCache.clear();
    this._started.set(false);
    this._validity.set(null);
    this._manualAirports.set([]);
    this._airport.set(null);
    this._index.set({ status: 'none' });
    this._tab.set(DEFAULT_TAB);
    this._runway.set(null);
    this._chart.set(null);
    this._pages.set({ status: 'none' });
    this._pageIndex.set(0);
    this.view.set(FIT_VIEW);
    this.clipboard.reset();
  }
}
