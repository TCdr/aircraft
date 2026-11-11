// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { gbasAirports } from '../../../../../../../fbw-common/src/systems/shared/src/gbas/GbasApproachTable';
import { GlsApproachData } from './GlsApproachData';
import { createGbasTableAirportLoader, ManualGlsTuningContext, tuneManualGls } from './ManualGlsTuning';

const EDDF_25C = {
  ident: 'RW25C',
  bearing: 249,
  magneticBearing: 249,
  length: 4000,
  thresholdLocation: { lat: 50.0345, long: 8.5812, alt: 365 },
};

function context(overrides: Partial<ManualGlsTuningContext> = {}) {
  const tuned: { gls: GlsApproachData; field: string }[] = [];
  const result: ManualGlsTuningContext = {
    destinationIdent: 'EDDF',
    originIdent: null,
    presentPosition: null,
    loadTableAirports: () => Promise.resolve([{ ident: 'EDDF', location: { lat: 50.033, long: 8.57 } }]),
    loadRunways: () => Promise.resolve([EDDF_25C]),
    isTuningLocked: () => false,
    setManualGls: (gls, field) => tuned.push({ gls, field }),
    ...overrides,
  };
  return { result, tuned };
}

describe('manual GLS tuning', () => {
  it('sets the GLS of a channel at the destination and keeps the field it was typed into', async () => {
    const { result, tuned } = context();

    await expect(tuneManualGls(31434, 'channel', result)).resolves.toBe('tuned');

    expect(tuned).toHaveLength(1);
    expect(tuned[0].field).toBe('channel');
    expect(tuned[0].gls).toMatchObject({ channel: 31434, rpi: 'G25P' });
  });

  it('sets the GLS of a reference path identifier of the destination', async () => {
    const { result, tuned } = context();

    await expect(tuneManualGls('G25P', 'ident', result)).resolves.toBe('tuned');

    expect(tuned[0]).toMatchObject({ field: 'ident', gls: { channel: 31434 } });
  });

  it('tunes a channel that no airport has, with nothing to be received', async () => {
    const { result, tuned } = context();

    await expect(tuneManualGls(39999, 'channel', result)).resolves.toBe('tuned');

    expect(tuned[0].gls).toMatchObject({ channel: 39999, rpi: null, definition: null });
  });

  it('keeps the table values when the sim has no such runway', async () => {
    const { result, tuned } = context({ loadRunways: () => Promise.resolve([]) });

    await tuneManualGls(31434, 'channel', result);

    expect(tuned[0].gls).toMatchObject({ channel: 31434, rpi: 'G25P', definition: null });
  });

  it('sets nothing and says so when the tuning locks while the facilities load', async () => {
    let locked = false;
    const { result, tuned } = context({
      isTuningLocked: () => locked,
      loadTableAirports: () => {
        locked = true;
        return Promise.resolve([{ ident: 'EDDF', location: { lat: 50.033, long: 8.57 } }]);
      },
    });

    await expect(tuneManualGls(31434, 'channel', result)).resolves.toBe('locked');
    expect(tuned).toHaveLength(0);
  });

  it('sets nothing and says so when the tuning locks while the runways load', async () => {
    let locked = false;
    const { result, tuned } = context({
      isTuningLocked: () => locked,
      loadRunways: () => {
        locked = true;
        return Promise.resolve([EDDF_25C]);
      },
    });

    await expect(tuneManualGls('G25P', 'ident', result)).resolves.toBe('locked');
    expect(tuned).toHaveLength(0);
  });

  it('locks out an unknown channel as well', async () => {
    const { result, tuned } = context({ isTuningLocked: () => true });

    await expect(tuneManualGls(39999, 'channel', result)).resolves.toBe('locked');
    expect(tuned).toHaveLength(0);
  });

  it('hands back an identifier that is no GLS of the destination or origin, to be looked up as an ILS', async () => {
    const { result, tuned } = context();

    await expect(tuneManualGls('X99Z', 'ident', result)).resolves.toBe('unknown-rpi');

    expect(tuned).toHaveLength(0);
  });

  it('rejects anything that is neither a channel nor an identifier', async () => {
    const { result, tuned } = context();
    const loadRunways = vi.fn();

    await expect(tuneManualGls('ABC', 'ident', { ...result, loadRunways })).resolves.toBe('invalid');
    await expect(tuneManualGls(19999, 'channel', result)).resolves.toBe('invalid');

    expect(tuned).toHaveLength(0);
    expect(loadRunways).not.toHaveBeenCalled();
  });
});

describe('GBAS table airport loader', () => {
  const allTableAirports = () =>
    gbasAirports().map((ident, index) => ({ ident, location: { lat: index, long: index }, name: `Airport ${ident}` }));

  it('reads the database once and keeps only ident and location', async () => {
    const getAirports = vi.fn(() => Promise.resolve(allTableAirports()));
    const load = createGbasTableAirportLoader(() => ({ getAirports }));

    const first = await load();
    const second = await load();

    expect(getAirports).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(first).toHaveLength(gbasAirports().length);
    expect(first[0]).toEqual({ ident: gbasAirports()[0], location: { lat: 0, long: 0 } });
  });

  it('reads the database again after a load that did not bring every airport', async () => {
    const complete = allTableAirports();
    const getAirports = vi
      .fn<() => Promise<typeof complete>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(complete.slice(0, 1))
      .mockResolvedValue(complete);
    const load = createGbasTableAirportLoader(() => ({ getAirports }));

    await expect(load()).resolves.toEqual([]);
    await expect(load()).resolves.toHaveLength(1);
    await expect(load()).resolves.toHaveLength(complete.length);
    await expect(load()).resolves.toHaveLength(complete.length);

    expect(getAirports).toHaveBeenCalledTimes(3);
  });
});
