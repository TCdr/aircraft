// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import type { MmrRadioTuningStatus } from '../NavaidTuner';
import { RmpGlsTuning, RmpGlsTuningContext, updateRmpGlsReceivers } from './RmpGlsTuning';

const EDDF_25C = {
  ident: 'RW25C',
  bearing: 249,
  magneticBearing: 249,
  length: 4000,
  thresholdLocation: { lat: 50.0345, long: 8.5812, alt: 365 },
};

const NEAR_FRANKFURT = { lat: 49.5, long: 8 };
const FAR_FROM_FRANKFURT = { lat: 40.69, long: -74.17 };

function context(overrides: Partial<RmpGlsTuningContext> = {}): RmpGlsTuningContext {
  return {
    presentPosition: NEAR_FRANKFURT,
    loadTableAirports: () => Promise.resolve([{ ident: 'EDDF', location: { lat: 50.033, long: 8.57 } }]),
    loadRunways: () => Promise.resolve([EDDF_25C]),
    ...overrides,
  };
}

const RETRY_MS = 10_000;

/** one update without elapsed time */
const update = (tuning: RmpGlsTuning, channel: number, ctx: RmpGlsTuningContext, deltaTime = 0) =>
  tuning.update(channel, () => ctx, deltaTime);

/** lets the pending resolutions finish */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('GLS tuned on the RMP', () => {
  it('resolves the channel to the nearest table airport, without a destination', async () => {
    const tuning = new RmpGlsTuning();

    expect(update(tuning, 31434, context())).toBeNull();
    await settle();

    expect(update(tuning, 31434, context())).toMatchObject({ channel: 31434, rpi: 'G25P' });
  });

  it('tunes a channel that only an airport out of range has, with nothing to receive', async () => {
    const tuning = new RmpGlsTuning();
    const far = context({ presentPosition: FAR_FROM_FRANKFURT });

    update(tuning, 31434, far);
    await settle();

    expect(update(tuning, 31434, far)).toMatchObject({ channel: 31434, rpi: null, definition: null });
  });

  it('starts one load for the same channel', async () => {
    const tuning = new RmpGlsTuning();
    const loadRunways = vi.fn(() => Promise.resolve([EDDF_25C]));
    const ctx = context({ loadRunways });

    update(tuning, 31434, ctx);
    update(tuning, 31434, ctx);
    await settle();
    update(tuning, 31434, ctx);
    update(tuning, 31434, ctx);

    expect(loadRunways).toHaveBeenCalledTimes(1);
  });

  it('drops the result of a channel that was replaced while its runways loaded', async () => {
    const tuning = new RmpGlsTuning();
    let finishFirstLoad: () => void = () => undefined;
    const slowRunways = () =>
      new Promise<(typeof EDDF_25C)[]>((resolve) => {
        finishFirstLoad = () => resolve([EDDF_25C]);
      });

    update(tuning, 31434, context({ loadRunways: slowRunways }));
    await settle();
    // not a channel of the table: resolves at once with nothing to receive
    update(tuning, 39998, context());
    await settle();
    finishFirstLoad();
    await settle();

    expect(update(tuning, 39998, context())).toMatchObject({ channel: 39998, definition: null });
  });

  it('resolves nothing for channel 0 and forgets the previous channel', async () => {
    const tuning = new RmpGlsTuning();
    update(tuning, 31434, context());
    await settle();

    expect(update(tuning, 0, context())).toBeNull();
    expect(update(tuning, 31434, context())).toBeNull();
  });

  it('resolves a channel again after it was cleared', async () => {
    const tuning = new RmpGlsTuning();
    const loadRunways = vi.fn(() => Promise.resolve([EDDF_25C]));
    const ctx = context({ loadRunways });
    update(tuning, 31434, ctx);
    await settle();

    tuning.clear();
    update(tuning, 31434, ctx);
    await settle();

    expect(loadRunways).toHaveBeenCalledTimes(2);
    expect(update(tuning, 31434, ctx)).toMatchObject({ channel: 31434 });
  });

  describe('a channel that found no station', () => {
    it('is looked up again once the aircraft is in range', async () => {
      const tuning = new RmpGlsTuning();
      update(tuning, 31434, context({ presentPosition: FAR_FROM_FRANKFURT }));
      await settle();

      update(tuning, 31434, context(), RETRY_MS);
      await settle();

      expect(update(tuning, 31434, context())).toMatchObject({ channel: 31434, rpi: 'G25P' });
    });

    it('is looked up again once the position is known', async () => {
      const tuning = new RmpGlsTuning();
      update(tuning, 31434, context({ presentPosition: null }));
      await settle();
      expect(update(tuning, 31434, context())).toMatchObject({ definition: null });

      update(tuning, 31434, context(), RETRY_MS);
      await settle();

      expect(update(tuning, 31434, context())).toMatchObject({ rpi: 'G25P' });
    });

    it('is looked up again after the database failed', async () => {
      const tuning = new RmpGlsTuning();
      update(tuning, 31434, context({ loadTableAirports: () => Promise.reject(new Error('no database')) }));
      await settle();
      expect(update(tuning, 31434, context())).toBeNull();

      update(tuning, 31434, context(), RETRY_MS);
      await settle();

      expect(update(tuning, 31434, context())).toMatchObject({ rpi: 'G25P' });
    });

    it('is not looked up on every update, but on a timer', async () => {
      const tuning = new RmpGlsTuning();
      const loadTableAirports = vi.fn(() => Promise.resolve([]));
      const ctx = context({ loadTableAirports });
      update(tuning, 31434, ctx);
      await settle();

      update(tuning, 31434, ctx, RETRY_MS / 4);
      update(tuning, 31434, ctx, RETRY_MS / 4);
      expect(loadTableAirports).toHaveBeenCalledTimes(1);

      update(tuning, 31434, ctx, RETRY_MS / 2);
      expect(loadTableAirports).toHaveBeenCalledTimes(2);
    });

    it('does not start a second lookup while one is running', () => {
      const tuning = new RmpGlsTuning();
      const loadTableAirports = vi.fn(() => new Promise<never[]>(() => undefined));
      const ctx = context({ loadTableAirports });

      update(tuning, 31434, ctx);
      update(tuning, 31434, ctx, RETRY_MS);
      update(tuning, 31434, ctx, RETRY_MS);

      expect(loadTableAirports).toHaveBeenCalledTimes(1);
    });

    it('drops the late result of a lookup of a channel that was cleared meanwhile', async () => {
      const tuning = new RmpGlsTuning();
      let finishLookup: () => void = () => undefined;
      const slowRunways = () =>
        new Promise<(typeof EDDF_25C)[]>((resolve) => {
          finishLookup = () => resolve([EDDF_25C]);
        });
      update(tuning, 31434, context({ loadRunways: slowRunways }));
      await settle();

      tuning.clear();
      finishLookup();
      await settle();

      expect(update(tuning, 31434, context({ presentPosition: FAR_FROM_FRANKFURT }))).toBeNull();
    });

    it('is not looked up again once a station is found', async () => {
      const tuning = new RmpGlsTuning();
      const loadTableAirports = vi.fn(() =>
        Promise.resolve([{ ident: 'EDDF', location: { lat: 50.033, long: 8.57 } }]),
      );
      const ctx = context({ loadTableAirports });
      update(tuning, 31434, ctx);
      await settle();

      update(tuning, 31434, ctx, RETRY_MS * 3);

      expect(loadTableAirports).toHaveBeenCalledTimes(1);
    });
  });
});

describe('MMRs following the GLS channel of the RMPs', () => {
  const idleMmr = (): MmrRadioTuningStatus => ({
    databaseCourse: null,
    databaseBackcourse: false,
    frequency: null,
    course: null,
    courseManual: false,
    ident: null,
    manual: false,
    backcourse: false,
    slope: null,
  });

  const loaders = { loadTableAirports: context().loadTableAirports, loadRunways: context().loadRunways };

  const inputs = (overrides: Partial<Parameters<typeof updateRmpGlsReceivers>[2]> = {}) => ({
    rmpTuningActive: true,
    loaders,
    readChannel: () => 31434,
    presentPosition: () => NEAR_FRANKFURT,
    ...overrides,
  });

  /** an MMR that sits on a GLS the MCDU tuned */
  const mmrOnGls = (): MmrRadioTuningStatus => ({
    ...idleMmr(),
    gls: { channel: 28968, rpi: 'G25M', course: 246, slope: -3, definition: null },
    glsEntry: 'channel',
    manual: true,
  });

  it('tune both MMRs to the resolved GLS', async () => {
    const tuning = new RmpGlsTuning();
    const mmrs = [idleMmr(), idleMmr()];
    updateRmpGlsReceivers(tuning, mmrs, inputs(), 0);
    await settle();

    updateRmpGlsReceivers(tuning, mmrs, inputs(), 0);

    expect(mmrs[0].gls).toMatchObject({ channel: 31434, rpi: 'G25P' });
    expect(mmrs[1].gls).toBe(mmrs[0].gls);
  });

  it('keep the previous channel while the new one is being resolved', () => {
    const mmrs = [mmrOnGls(), mmrOnGls()];
    const before = mmrs[0].gls;

    updateRmpGlsReceivers(new RmpGlsTuning(), mmrs, inputs(), 0);

    expect(mmrs[0].gls).toBe(before);
  });

  it('leave the GLS mode on both MMRs when the RMPs tuned no channel', () => {
    const mmrs = [mmrOnGls(), mmrOnGls()];

    updateRmpGlsReceivers(new RmpGlsTuning(), mmrs, inputs({ readChannel: () => 0 }), 0);

    expect(mmrs).toEqual([idleMmr(), idleMmr()]);
  });

  it('leave the GLS mode when no RMP is in the NAV backup mode, whatever the channel says', () => {
    const mmrs = [mmrOnGls(), mmrOnGls()];
    const readChannel = vi.fn(() => 31434);

    updateRmpGlsReceivers(new RmpGlsTuning(), mmrs, inputs({ rmpTuningActive: false, readChannel }), 0);

    expect(mmrs).toEqual([idleMmr(), idleMmr()]);
    expect(readChannel).not.toHaveBeenCalled();
  });

  it('never read the channel without loaders (A380X) and always leave the GLS mode', () => {
    const mmrs = [mmrOnGls(), mmrOnGls()];
    const readChannel = vi.fn(() => 31434);

    updateRmpGlsReceivers(new RmpGlsTuning(), mmrs, inputs({ loaders: null, readChannel }), 0);

    expect(mmrs).toEqual([idleMmr(), idleMmr()]);
    expect(readChannel).not.toHaveBeenCalled();
  });
});
