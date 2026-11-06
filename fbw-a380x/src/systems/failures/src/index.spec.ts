// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it, vi } from 'vitest';

// The index loads inside the test; with the build machine busy that takes longer than the 5 s default
vi.setConfig({ testTimeout: 60_000 });

/*
 * The cockpit displays and the systems host import this index for the failure ids. The bundler keeps every module the
 * index reaches, read or not, so a re-export of the detail texts here puts about 1 MB of flyPad-only text into each of
 * their bundles; all the views share one JavaScript heap in the sim.
 */
describe('failures index', () => {
  it('does not load the failure detail texts', async () => {
    const detailModules = [
      './a380-details',
      ...readdirSync(resolve(__dirname, 'details')).map((file) => `./details/${file.replace(/\.ts$/, '')}`),
    ];
    const loadedDetailModules: string[] = [];
    for (const detailModule of detailModules) {
      vi.doMock(detailModule, () => {
        loadedDetailModules.push(detailModule);
        return {};
      });
    }

    const index = await import('./index');

    expect(index.A380FailureDefinitions.length).toBeGreaterThan(0);
    expect(loadedDetailModules).toEqual([]);
  });
});
