// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ChartImage, ChartImageSupplier, Subject } from '@microsoft/msfs-sdk';
import { describe, expect, it } from 'vitest';
import { SharedChartImageSupplier } from './SharedChartImageSupplier';

/** @returns a view of the sim that records what it is asked, and the image it shows */
function fakeView() {
  const image = Subject.create({ chartUrl: '', imageUrl: '', errorCode: 0 } as unknown as ChartImage);
  const calls: string[] = [];
  let destroyed = 0;
  const view = {
    image,
    showChartImage: (url: string) => calls.push(url),
    destroy: () => destroyed++,
  } as unknown as ChartImageSupplier;
  return { view, image, calls, destroyedCount: () => destroyed };
}

describe('shared chart image supplier', () => {
  it('passes the image of the view on', () => {
    const { view, image } = fakeView();
    expect(new SharedChartImageSupplier(view).image).toBe(image);
  });

  it('is never destroyed with its viewer', () => {
    const { view, destroyedCount } = fakeView();
    new SharedChartImageSupplier(view).destroy();
    expect(destroyedCount()).toBe(0);
  });

  it('asks for an address once while its answer is on its way and after it came', () => {
    const { view, image, calls } = fakeView();
    const supplier = new SharedChartImageSupplier(view);
    supplier.showChartImage('chart://a');
    supplier.showChartImage('chart://a');
    image.set({ chartUrl: 'chart://a', imageUrl: 'liveview://1', errorCode: 0 } as unknown as ChartImage);
    supplier.showChartImage('chart://a');
    expect(calls).toEqual(['chart://a']);
    supplier.showChartImage('chart://b');
    expect(calls).toEqual(['chart://a', 'chart://b']);
  });

  it('asks again for an address whose answer was an error', () => {
    const { view, image, calls } = fakeView();
    const supplier = new SharedChartImageSupplier(view);
    supplier.showChartImage('chart://a');
    image.set({ chartUrl: 'chart://a', imageUrl: '', errorCode: 3 } as unknown as ChartImage);
    supplier.showChartImage('chart://a');
    expect(calls).toEqual(['chart://a', 'chart://a']);
  });

  it('clears the image once', () => {
    const { view, calls } = fakeView();
    const supplier = new SharedChartImageSupplier(view);
    supplier.showChartImage('');
    supplier.showChartImage('chart://a');
    supplier.showChartImage('');
    supplier.showChartImage('');
    expect(calls).toEqual(['chart://a', '']);
  });
});
