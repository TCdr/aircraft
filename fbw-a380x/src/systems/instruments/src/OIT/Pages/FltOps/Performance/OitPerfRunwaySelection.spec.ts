// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, Subject } from '@microsoft/msfs-sdk';
import { describe, expect, it, vi } from 'vitest';
import { OitPerfRunwaySelection, RunwayDependentEntries } from './OitPerfRunwaySelection';

vi.mock('./OitPerfAirports', () => {
  const runway = (ident: string) => ({ ident });
  const airports: Record<string, unknown> = {
    EGLL: { icao: 'EGLL', name: 'LONDON HEATHROW', runways: ['09L', '27R'].map(runway) },
  };
  return { loadPerformanceAirport: async (_bus: unknown, icao: string) => airports[icao] ?? null };
});

/** @returns the entries of a page that comes back with the airport and the runway the crew entered before */
function reopenedPageEntries(): RunwayDependentEntries {
  return {
    airport: Subject.create<string | null>('EGLL'),
    runwayIdent: Subject.create<string | null>('27R'),
    wind: Subject.create(null),
    oat: Subject.create(null),
    qnh: Subject.create(null),
  };
}

/**
 * @returns a promise that resolves once the airport has loaded, which the selection awaits
 */
const airportLoaded = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('runway list of T.O PERF and LDG PERF', () => {
  it('lists the runways before the selected runway index points into the list, when a page is opened again', async () => {
    const selection = new OitPerfRunwaySelection(new EventBus(), reopenedPageEntries());
    const errors: unknown[] = [];
    // What the dropdown of the page does when the selected index changes: it reads the name from its list
    const dropdown = selection.runwayIndex.sub((index) => {
      try {
        if (index !== null) {
          selection.runwayIdents.get(index);
        }
      } catch (e) {
        errors.push(e);
      }
    });
    const following = selection.follow();

    await airportLoaded();

    expect(errors).toEqual([]);
    expect(selection.runwayIdents.getArray()).toEqual(['09L', '27R']);
    expect(selection.runwayIndex.get()).toBe(1);
    dropdown.destroy();
    following.forEach((s) => s.destroy());
    selection.computedSubjects().forEach((s) => s.destroy());
  });
});
