// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ChartsClientErrorCode } from '@microsoft/msfs-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MsfsLidoChartSource } from './MsfsLidoChartSource';

/** What the fake chart service of the sim has been asked, and what it was asked to destroy */
const native = vi.hoisted(() => ({
  viewsCreated: 0,
  viewsInitialized: 0,
  viewsDestroyed: 0,
  imagesShown: [] as string[],
  indexRequests: [] as string[],
  pageRequests: [] as string[],
  answerIndex: (() => {}) as (value: unknown) => void,
  failIndex: (() => {}) as (error: unknown) => void,
  image: { chartUrl: '', imageUrl: '', errorCode: 0 },
}));

vi.mock('@microsoft/msfs-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@microsoft/msfs-sdk')>();
  class FakeChartView {
    public readonly image = { get: () => native.image, sub: () => ({ destroy: () => {} }) };

    constructor() {
      native.viewsCreated++;
    }

    public showChartImage(url: string): void {
      native.imagesShown.push(url);
    }

    public destroy(): void {
      native.viewsDestroyed++;
    }
  }
  return {
    ...actual,
    ChartView: FakeChartView,
    ChartsClient: {
      initializeChartView: () => {
        native.viewsInitialized++;
        return Promise.resolve();
      },
      getIndexForAirport: (icao: { ident: string }) => {
        native.indexRequests.push(icao.ident);
        return new Promise((resolve, reject) => {
          native.answerIndex = resolve;
          native.failIndex = reject;
        });
      },
      getChartPages: (guid: string) => {
        native.pageRequests.push(guid);
        return new Promise(() => {});
      },
    },
  };
});

describe('the charts of the simulator on an OIT gauge', () => {
  beforeEach(() => {
    native.viewsCreated = 0;
    native.viewsInitialized = 0;
    native.viewsDestroyed = 0;
    native.imagesShown = [];
    native.indexRequests = [];
    native.pageRequests = [];
    native.image = { chartUrl: '', imageUrl: '', errorCode: 0 };
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it('has one chart view for the life of the gauge, initialized once', () => {
    const source = new MsfsLidoChartSource();
    const first = source.createImageSupplier();
    for (let visit = 0; visit < 20; visit++) {
      expect(source.createImageSupplier()).toBe(first);
    }
    expect(native.viewsCreated).toBe(1);
    expect(native.viewsInitialized).toBe(1);
  });

  it('makes no view before a viewer needs one', () => {
    new MsfsLidoChartSource();
    expect(native.viewsCreated).toBe(0);
  });

  it('never destroys the chart view, whatever a viewer does when its page closes', () => {
    const source = new MsfsLidoChartSource();
    for (let visit = 0; visit < 3; visit++) {
      const supplier = source.createImageSupplier();
      supplier.showChartImage('chart://page1');
      supplier.destroy();
    }
    expect(native.viewsDestroyed).toBe(0);
  });

  it('does not ask the service again for a question it has not answered, not even after the timeout', async () => {
    const source = new MsfsLidoChartSource();
    const first = source.index('LFBO');
    const second = source.index('LFBO');
    expect(native.indexRequests).toEqual(['LFBO']);

    first.catch(() => {});
    second.catch(() => {});
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(first).rejects.toThrow('did not answer');
    const retry = source.index('LFBO');
    retry.catch(() => {});
    expect(native.indexRequests).toEqual(['LFBO']);

    // The service answers late: the question is over and a new one is sent
    native.answerIndex({ charts: [] });
    await vi.advanceTimersByTimeAsync(0);
    const later = source.index('LFBO');
    later.catch(() => {});
    expect(native.indexRequests).toEqual(['LFBO', 'LFBO']);
  });

  it('answers an airport the provider has no charts for with an empty list, and fails on any other error', async () => {
    const source = new MsfsLidoChartSource();
    const unknown = source.index('ZZZZ');
    native.failIndex(ChartsClientErrorCode.NotFound);
    await expect(unknown).resolves.toEqual([]);

    const broken = source.index('LFBO');
    native.failIndex(new Error('no network'));
    await expect(broken).rejects.toThrow('no network');
  });

  it('asks about the pages of a chart once while the answer is on its way', () => {
    const source = new MsfsLidoChartSource();
    source.pages('chart-1').catch(() => {});
    source.pages('chart-1').catch(() => {});
    source.pages('chart-2').catch(() => {});
    expect(native.pageRequests).toEqual(['chart-1', 'chart-2']);
  });
});
