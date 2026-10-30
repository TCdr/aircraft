// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  BuiltInChartProvider,
  ChartImageSupplier,
  ChartsClient,
  ChartsClientErrorCode,
  ChartView,
  ICAO,
} from '@microsoft/msfs-sdk';
import { SharedChartImageSupplier } from './SharedChartImageSupplier';
import { TerminalChart, TerminalChartPage, TerminalChartSource } from './TerminalChartSource';

/** Design choice: the chart service of the sim sometimes never answers (no network): the page then says so */
const ANSWER_TIMEOUT_MS = 15000;

/**
 * @param request a request to the chart service
 * @returns the request, rejected when the service has not answered in time
 */
function withTimeout<T>(request: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The chart service did not answer')), ANSWER_TIMEOUT_MS);
    request.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * The charts of the simulator's own chart service, LIDO provider: it needs the online services of the sim, no account
 * and no login. The page code uses nothing of the SDK chart classes but through this class.
 */
export class MsfsLidoChartSource implements TerminalChartSource {
  /** The one view of this gauge, made when a viewer first needs it and never destroyed */
  private supplier: SharedChartImageSupplier | null = null;

  /** The questions the chart service has not answered yet, by what they ask for: a timeout does not cancel them */
  private readonly asking = new Map<string, Promise<unknown>>();

  /**
   * @param key what is asked for, with the kind of question
   * @param ask sends the question to the service
   * @returns the answer; a question already on its way is not sent again, the asker waits for that one
   */
  private askOnce<T>(key: string, ask: () => Promise<T>): Promise<T> {
    let pending = this.asking.get(key) as Promise<T> | undefined;
    if (pending === undefined) {
      pending = ask();
      this.asking.set(key, pending);
      const done = (): void => {
        this.asking.delete(key);
      };
      pending.then(done, done);
    }
    return withTimeout(pending);
  }

  /** @inheritdoc */
  public index(icao: string): Promise<TerminalChart[]> {
    return this.askOnce(`index ${icao}`, () =>
      ChartsClient.getIndexForAirport(ICAO.value('A', '', '', icao), BuiltInChartProvider.Lido),
    ).then(
      (index) => {
        const charts: TerminalChart[] = [];
        for (const category of index.charts) {
          for (const chart of category.charts) {
            if (!charts.some((known) => known.guid === chart.guid)) {
              charts.push({
                guid: chart.guid,
                name: chart.name,
                type: chart.type,
                runways: chart.runways.map((runway) => ({ number: runway.number, designator: runway.designator })),
                validFrom: chart.validFrom,
                validUntil: chart.validUntil,
              });
            }
          }
        }
        return charts;
      },
      (error) => {
        // An airport the provider has no charts for is an answer, not a failure of the service
        if (error === ChartsClientErrorCode.NotFound) {
          return [];
        }
        throw error;
      },
    );
  }

  /** @inheritdoc */
  public pages(guid: string): Promise<TerminalChartPage[]> {
    return this.askOnce(`pages ${guid}`, () => ChartsClient.getChartPages(guid)).then((chartPages) => {
      const pages: TerminalChartPage[] = [];
      for (const page of chartPages.pages) {
        // Design choice: the light image for every page: one look on every OIT, whatever the cockpit lighting
        const light = page.urls.find((url) => url.name === 'light_png');
        const dark = page.urls.find((url) => url.name === 'dark_png');
        const image = light ?? dark;
        if (image !== undefined) {
          pages.push({ width: page.width, height: page.height, imageUrl: image.url });
        }
      }
      return pages;
    });
  }

  /** @inheritdoc */
  public createImageSupplier(): ChartImageSupplier {
    if (this.supplier === null) {
      const view = new ChartView();
      ChartsClient.initializeChartView(view).catch(() => {
        // The listener of the sim never got ready: the view gets no image, and the viewer reports it
      });
      this.supplier = new SharedChartImageSupplier(view);
    }
    return this.supplier;
  }
}
