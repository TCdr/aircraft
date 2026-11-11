// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { Database } from './Database';
import { Approach, Arrival, DataInterface, Runway } from '../shared';

function approach(ident: string, runwayIdent: string): Approach {
  return { ident, runwayIdent } as unknown as Approach;
}

function databaseWith(approaches: Approach[], runways: Runway[] = []) {
  const backend = {
    getApproaches: vi.fn(() => Promise.resolve(approaches)),
    getRunways: vi.fn(() => Promise.resolve(runways)),
  };
  return { database: new Database(backend as unknown as DataInterface), backend };
}

describe('Database approaches', () => {
  it('returns the approaches of the backend without a provider', async () => {
    const { database } = databaseWith([approach('I25C', 'EDDF25C')]);

    expect((await database.getApproaches('EDDF')).map((a) => a.ident)).toEqual(['I25C']);
  });

  it('adds the approaches of the provider after those of the backend', async () => {
    const { database } = databaseWith([approach('I25C', 'EDDF25C')]);
    database.setSyntheticApproachProvider(() => Promise.resolve([approach('J25CZ', 'EDDF25C')]));

    expect((await database.getApproaches('EDDF')).map((a) => a.ident)).toEqual(['I25C', 'J25CZ']);
  });

  it('gives the provider the airport and the approaches of the backend', async () => {
    const backendApproaches = [approach('I25C', 'EDDF25C')];
    const { database } = databaseWith(backendApproaches);
    const provider = vi.fn(() => Promise.resolve([]));
    database.setSyntheticApproachProvider(provider);

    await database.getApproaches('EDDF');

    expect(provider).toHaveBeenCalledWith('EDDF', backendApproaches, expect.any(Function));
  });

  it('loads the runways only when the provider asks for them', async () => {
    const { database, backend } = databaseWith([]);
    database.setSyntheticApproachProvider(() => Promise.resolve([]));
    await database.getApproaches('LFPG');
    expect(backend.getRunways).not.toHaveBeenCalled();

    database.setSyntheticApproachProvider((_airport, _approaches, getRunways) => getRunways().then(() => []));
    await database.getApproaches('EDDF');
    expect(backend.getRunways).toHaveBeenCalledWith('EDDF');
  });

  it('applies the arrival filter to the added approaches as well', async () => {
    const { database } = databaseWith([approach('I25C', 'EDDF25C'), approach('I07L', 'EDDF07L')]);
    database.setSyntheticApproachProvider(() =>
      Promise.resolve([approach('J25CZ', 'EDDF25C'), approach('J07LZ', 'EDDF07L')]),
    );
    const arrival = { runwayTransitions: [{ ident: 'EDDF25C' }] } as unknown as Arrival;

    expect((await database.getApproaches('EDDF', arrival)).map((a) => a.ident)).toEqual(['I25C', 'J25CZ']);
  });

  it('keeps the approaches of the backend when the provider is removed', async () => {
    const { database } = databaseWith([approach('I25C', 'EDDF25C')]);
    database.setSyntheticApproachProvider(() => Promise.resolve([approach('J25CZ', 'EDDF25C')]));
    database.setSyntheticApproachProvider(null);

    expect((await database.getApproaches('EDDF')).map((a) => a.ident)).toEqual(['I25C']);
  });

  it('keeps the approaches of the backend when the provider fails', async () => {
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { database } = databaseWith([approach('I25C', 'EDDF25C'), approach('I07L', 'EDDF07L')]);
    database.setSyntheticApproachProvider(() => Promise.reject(new Error('runways not loaded')));
    const arrival = { runwayTransitions: [{ ident: 'EDDF25C' }] } as unknown as Arrival;

    await expect(database.getApproaches('EDDF').then((list) => list.map((a) => a.ident))).resolves.toEqual([
      'I25C',
      'I07L',
    ]);
    await expect(database.getApproaches('EDDF', arrival).then((list) => list.map((a) => a.ident))).resolves.toEqual([
      'I25C',
    ]);
    expect(logError).toHaveBeenCalledTimes(2);

    logError.mockRestore();
  });
});
