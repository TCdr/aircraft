// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ChartImageSupplier, LidoChartType, Subject } from '@microsoft/msfs-sdk';
import { ChartsSession, CLIPBOARD_TAB, DEFAULT_TAB } from './ChartsSession';
import { ChartsClipboard } from './ChartsClipboard';
import { TerminalChart, TerminalChartPage, TerminalChartSource } from './TerminalChartSource';
import { FIT_VIEW } from './TerminalChartViewport';

const day = (d: number) => Date.UTC(2026, 7, d);

/**
 * @param name the chart name
 * @param type the chart type of the provider
 * @param from the start of the validity
 * @param until the end of the validity
 * @returns a chart of an airport index
 */
function chart(
  name: string,
  type: string,
  from: number | null = day(7),
  until: number | null = day(27),
): TerminalChart {
  return { guid: `${type}-${name}`, name, type, runways: [], validFrom: from, validUntil: until };
}

interface Pending<T> {
  readonly key: string;
  resolve(value: T): void;
  reject(): void;
}

/** A chart service the spec answers by hand, request by request */
class FakeSource implements TerminalChartSource {
  public readonly indexRequests: Pending<TerminalChart[]>[] = [];

  public readonly pageRequests: Pending<TerminalChartPage[]>[] = [];

  public index(icao: string): Promise<TerminalChart[]> {
    return new Promise((resolve, reject) =>
      this.indexRequests.push({ key: icao, resolve, reject: () => reject(new Error()) }),
    );
  }

  public pages(guid: string): Promise<TerminalChartPage[]> {
    return new Promise((resolve, reject) =>
      this.pageRequests.push({ key: guid, resolve, reject: () => reject(new Error()) }),
    );
  }

  public createImageSupplier(): ChartImageSupplier {
    throw new Error('not used');
  }

  public requestsFor(icao: string): number {
    return this.indexRequests.filter((request) => request.key === icao).length;
  }

  /**
   * Answers the oldest unanswered request for an airport
   * @param icao the airport
   * @param charts the charts it answers with
   */
  public answer(icao: string, charts: TerminalChart[]): void {
    this.indexRequests
      .filter((request) => request.key === icao)
      .slice(-1)[0]
      .resolve(charts);
  }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** @returns a session on a fake chart service, with the flight plan LFBO to LFBD */
function setup() {
  const source = new FakeSource();
  const from = Subject.create<string | null>('LFBO');
  const to = Subject.create<string | null>('LFBD');
  const clipboard = new ChartsClipboard(1, { sendClipboard: () => {} }, Subject.create(true));
  const session = new ChartsSession(source, from, to, clipboard);
  return { source, from, to, session };
}

describe('start', () => {
  it('reads the first airport and takes the validity of the chart database', async () => {
    const { source, session } = setup();
    expect(session.validity.get()).toBeNull();
    expect(source.indexRequests).toHaveLength(0);

    session.start();
    expect(session.started.get()).toBe(true);
    expect(session.airport.get()).toBe('LFBO');
    expect(session.index.get().status).toBe('loading');

    source.answer('LFBO', [chart('ALB 1A', LidoChartType.Sid)]);
    await flush();
    expect(session.index.get().status).toBe('loaded');
    expect(session.validity.get()).toEqual({ from: day(7), until: day(27) });
  });

  it('starts once: opening the application again asks for nothing', async () => {
    const { source, session } = setup();
    session.start();
    source.answer('LFBO', [chart('ALB 1A', LidoChartType.Sid)]);
    await flush();
    session.start();
    expect(source.requestsFor('LFBO')).toBe(1);
  });

  it('has no airport to read when the flight plan is empty, and takes one when it gets one', async () => {
    const { source, from, to, session } = setup();
    from.set(null);
    to.set(null);
    session.start();
    expect(session.airport.get()).toBeNull();
    expect(source.indexRequests).toHaveLength(0);

    to.set('EGLL');
    expect(session.airport.get()).toBe('EGLL');
    expect(source.requestsFor('EGLL')).toBe(1);
  });

  it('gives no validity while the charts carry no dates, and takes the next index that does', async () => {
    const { source, session } = setup();
    session.start();
    source.answer('LFBO', [chart('ALB 1A', LidoChartType.Sid, null, null)]);
    await flush();
    expect(session.validity.get()).toBeNull();

    session.selectAirport('LFBD');
    source.answer('LFBD', [chart('X', LidoChartType.Sid)]);
    await flush();
    expect(session.validity.get()).toEqual({ from: day(7), until: day(27) });
  });

  it('keeps the validity it took when another airport answers later', async () => {
    const { source, session } = setup();
    session.start();
    source.answer('LFBO', [chart('A', LidoChartType.Sid, day(7), day(27))]);
    await flush();
    session.selectAirport('LFBD');
    source.answer('LFBD', [chart('B', LidoChartType.Sid, day(9), day(30))]);
    await flush();
    expect(session.validity.get()).toEqual({ from: day(7), until: day(27) });
  });
});

describe('cache', () => {
  it('answers an airport read before without a second request', async () => {
    const { source, session } = setup();
    session.start();
    source.answer('LFBO', [chart('A', LidoChartType.Sid)]);
    await flush();
    session.selectAirport('LFBD');
    source.answer('LFBD', [chart('B', LidoChartType.Sid)]);
    await flush();

    session.selectAirport('LFBO');
    expect(session.index.get().status).toBe('loaded');
    expect(source.requestsFor('LFBO')).toBe(1);
  });

  it('forgets the airport read longest ago when there are too many', async () => {
    const { source, session } = setup();
    session.start();
    source.answer('LFBO', [chart('A', LidoChartType.Sid)]);
    await flush();
    for (let i = 0; i < 10; i++) {
      const icao = `Z00${i}`;
      session.selectAirport(icao);
      source.answer(icao, [chart(icao, LidoChartType.Sid)]);
      await flush();
    }
    // eleven airports were read: the first one is gone, the latest ones stay
    session.selectAirport('Z009');
    expect(source.requestsFor('Z009')).toBe(1);
    session.selectAirport('LFBO');
    expect(source.requestsFor('LFBO')).toBe(2);
  });

  it('asks only once for an airport that has not answered yet', () => {
    const { source, session } = setup();
    session.start();
    session.selectAirport('LFBD');
    session.selectAirport('LFBO');
    session.selectAirport('LFBD');
    expect(source.requestsFor('LFBO')).toBe(1);
    expect(source.requestsFor('LFBD')).toBe(1);
  });
});

describe('late answers', () => {
  it('does not show the answer for an airport the crew has left', async () => {
    const { source, session } = setup();
    session.start();
    session.selectAirport('LFBD');
    // LFBO answers after LFBD was selected
    source.answer('LFBO', [chart('FROM CHART', LidoChartType.Sid)]);
    await flush();
    expect(session.airport.get()).toBe('LFBD');
    expect(session.index.get().status).toBe('loading');

    source.answer('LFBD', [chart('TO CHART', LidoChartType.Star)]);
    await flush();
    const index = session.index.get();
    expect(index.status === 'loaded' && index.charts[0].name).toBe('TO CHART');
  });

  it('shows the cached answer when the crew goes back to the airport', async () => {
    const { source, session } = setup();
    session.start();
    session.selectAirport('LFBD');
    source.answer('LFBO', [chart('FROM CHART', LidoChartType.Sid)]);
    await flush();
    session.selectAirport('LFBO');
    expect(session.index.get().status).toBe('loaded');
  });

  it('drops an answer that comes after the laptop restarted', async () => {
    const { source, session } = setup();
    session.start();
    session.reset();
    source.answer('LFBO', [chart('A', LidoChartType.Sid)]);
    await flush();
    expect(session.index.get().status).toBe('none');
    expect(session.validity.get()).toBeNull();
    // the airport is asked again by the next session
    session.start();
    expect(source.requestsFor('LFBO')).toBe(2);
  });
});

describe('failures', () => {
  it('shows an error when the service does not answer, and loads on RETRY', async () => {
    const { source, session } = setup();
    session.start();
    source.indexRequests[0].reject();
    await flush();
    expect(session.index.get().status).toBe('error');
    expect(session.validity.get()).toBeNull();

    session.retry();
    expect(session.index.get().status).toBe('loading');
    source.answer('LFBO', [chart('A', LidoChartType.Sid)]);
    await flush();
    expect(session.index.get().status).toBe('loaded');
    expect(source.requestsFor('LFBO')).toBe(2);
  });

  it('shows an empty index for an airport without charts, and keeps that answer', async () => {
    const { source, session } = setup();
    session.start();
    source.answer('LFBO', []);
    await flush();
    expect(session.index.get().status).toBe('empty');
    expect(session.validity.get()).toBeNull();
    session.selectAirport('LFBD');
    session.selectAirport('LFBO');
    expect(session.index.get().status).toBe('empty');
    expect(source.requestsFor('LFBO')).toBe(1);
  });
});

describe('selection', () => {
  /** @returns a session whose first airport was read: a SID and two approach charts */
  async function loaded() {
    const context = setup();
    context.session.start();
    context.source.answer('LFBO', [
      chart('ALB 1A', LidoChartType.Sid),
      chart('ILS 14L', LidoChartType.Iac),
      { ...chart('ILS 32R', LidoChartType.Iac), runways: [{ number: '32', designator: 'R' }] },
    ]);
    await flush();
    return context;
  }

  it('lists the charts of the tab', async () => {
    const { session } = await loaded();
    expect(session.listedCharts.get().map((c) => c.name)).toEqual(['ALB 1A']);
    session.selectTab('APPR');
    expect(session.listedCharts.get().map((c) => c.name)).toEqual(['ILS 14L', 'ILS 32R']);
  });

  it('limits the list to a runway and drops the runway when the tab has none like it', async () => {
    const { session } = await loaded();
    session.selectTab('APPR');
    expect(session.runwaysOfTab.get()).toEqual(['32R']);
    session.setRunway('32R');
    expect(session.listedCharts.get().map((c) => c.name)).toEqual(['ILS 14L', 'ILS 32R']);
    session.selectTab('DEP');
    expect(session.runway.get()).toBeNull();
  });

  it('lists no charts for the clipboard tab', async () => {
    const { session } = await loaded();
    session.selectTab(CLIPBOARD_TAB);
    expect(session.listedCharts.get()).toEqual([]);
  });

  it('adds a typed airport to the selection and selects it', () => {
    const { session } = setup();
    session.start();
    expect(session.addAirport('egll')).toBe(true);
    expect(session.airports.get()).toEqual(['LFBO', 'LFBD', 'EGLL']);
    expect(session.airport.get()).toBe('EGLL');
    expect(session.isManualAirport('EGLL')).toBe(true);
    expect(session.isManualAirport('LFBO')).toBe(false);
  });

  it('refuses a code that is not an airport code', () => {
    const { session } = setup();
    session.start();
    expect(session.addAirport('EG')).toBe(false);
    expect(session.airports.get()).toEqual(['LFBO', 'LFBD']);
  });

  it('selects an airport of the flight plan that is typed, without adding it twice', () => {
    const { session } = setup();
    session.start();
    session.addAirport('LFBD');
    expect(session.airport.get()).toBe('LFBD');
    expect(session.airports.get()).toEqual(['LFBO', 'LFBD']);
    expect(session.isManualAirport('LFBD')).toBe(false);
  });

  it('goes to the first airport when the selected one is removed', () => {
    const { session } = setup();
    session.start();
    session.addAirport('EGLL');
    session.removeAirport('EGLL');
    expect(session.airports.get()).toEqual(['LFBO', 'LFBD']);
    expect(session.airport.get()).toBe('LFBO');
  });

  it('follows the flight plan: a new departure takes over from an airport that left the selection', () => {
    const { session, from } = setup();
    session.start();
    from.set('LFPG');
    expect(session.airport.get()).toBe('LFPG');
  });
});

describe('chart pages', () => {
  const ref = { icao: 'LFBO', guid: 'SID-ALB 1A', name: 'ALB 1A' };
  const pages: TerminalChartPage[] = [
    { width: 600, height: 800, imageUrl: 'p1' },
    { width: 600, height: 800, imageUrl: 'p2' },
  ];

  it('loads the pages of the chart that is opened, and reuses them', async () => {
    const { source, session } = setup();
    session.openChart(ref);
    expect(session.pages.get().status).toBe('loading');
    source.pageRequests[0].resolve(pages);
    await flush();
    expect(session.pages.get().status).toBe('loaded');

    session.closeChart();
    session.openChart(ref);
    expect(session.pages.get().status).toBe('loaded');
    expect(source.pageRequests).toHaveLength(1);
  });

  it('does not show the pages of a chart the crew has left', async () => {
    const { source, session } = setup();
    session.openChart(ref);
    session.openChart({ icao: 'LFBO', guid: 'other', name: 'other' });
    source.pageRequests[0].resolve(pages);
    await flush();
    expect(session.pages.get().status).toBe('loading');
  });

  it('reports a failure and loads on RETRY', async () => {
    const { source, session } = setup();
    session.openChart(ref);
    source.pageRequests[0].reject();
    await flush();
    expect(session.pages.get().status).toBe('error');
    session.retry();
    source.pageRequests[1].resolve(pages);
    await flush();
    expect(session.pages.get().status).toBe('loaded');
  });

  it('opens a new page whole', async () => {
    const { source, session } = setup();
    session.openChart(ref);
    source.pageRequests[0].resolve(pages);
    await flush();
    session.view.set({ zoomIndex: 3, centreX: 0.2, centreY: 0.8 });
    session.setPage(1);
    expect(session.pageIndex.get()).toBe(1);
    expect(session.view.get()).toEqual(FIT_VIEW);
  });

  it('stays on the page numbers the chart has', async () => {
    const { source, session } = setup();
    session.openChart(ref);
    source.pageRequests[0].resolve(pages);
    await flush();
    session.setPage(5);
    session.setPage(-1);
    expect(session.pageIndex.get()).toBe(0);
  });

  it('opens a chart whole, on its first page', async () => {
    const { source, session } = setup();
    session.openChart(ref);
    source.pageRequests[0].resolve(pages);
    await flush();
    session.setPage(1);
    session.view.set({ zoomIndex: 2, centreX: 0.1, centreY: 0.1 });
    session.openChart(ref);
    expect(session.pageIndex.get()).toBe(0);
    expect(session.view.get()).toEqual(FIT_VIEW);
  });
});

describe('home', () => {
  it('is at home as it opens, and not once a chart is open or the tab changed', async () => {
    const { source, session } = setup();
    session.start();
    source.answer('LFBO', [chart('A', LidoChartType.Sid)]);
    await flush();
    expect(session.atHome.get()).toBe(true);
    session.selectTab('ARR');
    expect(session.atHome.get()).toBe(false);
    session.selectTab(DEFAULT_TAB);
    expect(session.atHome.get()).toBe(true);
    session.openChart({ icao: 'LFBO', guid: 'g', name: 'n' });
    expect(session.atHome.get()).toBe(false);
  });

  it('returns to the list of the first airport from any state', async () => {
    const { source, session } = setup();
    session.start();
    source.answer('LFBO', [chart('A', LidoChartType.Sid)]);
    await flush();
    session.addAirport('EGLL');
    session.selectTab(CLIPBOARD_TAB);
    session.openChart({ icao: 'EGLL', guid: 'g', name: 'n' });
    expect(session.atHome.get()).toBe(false);

    session.home();
    expect(session.atHome.get()).toBe(true);
    expect(session.airport.get()).toBe('LFBO');
    expect(session.tab.get()).toBe(DEFAULT_TAB);
    expect(session.chart.get()).toBeNull();
    expect(session.index.get().status).toBe('loaded');
  });
});

describe('laptop restart', () => {
  it('clears what the crew did and the validity, and reads again at the next start', async () => {
    const { source, session } = setup();
    session.start();
    source.answer('LFBO', [chart('A', LidoChartType.Sid)]);
    await flush();
    session.addAirport('EGLL');
    session.selectTab('ARR');
    session.openChart({ icao: 'LFBO', guid: 'g', name: 'n' });

    session.reset();
    expect(session.started.get()).toBe(false);
    expect(session.validity.get()).toBeNull();
    expect(session.airport.get()).toBeNull();
    expect(session.airports.get()).toEqual(['LFBO', 'LFBD']);
    expect(session.chart.get()).toBeNull();
    expect(session.tab.get()).toBe(DEFAULT_TAB);
    expect(session.index.get().status).toBe('none');

    session.start();
    expect(source.requestsFor('LFBO')).toBe(2);
  });

  it('empties the clipboard too', () => {
    const { session } = setup();
    session.clipboard.prepare({ icao: 'LFBO', guid: 'g', name: 'n' });
    session.reset();
    expect(session.clipboard.charts.get()).toEqual([]);
  });
});
