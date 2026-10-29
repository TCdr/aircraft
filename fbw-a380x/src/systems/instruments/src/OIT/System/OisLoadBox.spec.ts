// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import type { ISimbriefData } from '@flybywiresim/fbw-sdk';
import { effExportIdentifier, effFolderLabel, effFromOfp, effIdentifier, oisDate, OisLoadBox } from './OisLoadBox';

/**
 * @param flightNumber the flight number without the airline code
 * @param schedOut the scheduled departure, unix seconds
 * @returns an OFP with the fields the LOAD BOX reads
 */
function ofp(flightNumber: string, schedOut = '1222156800'): ISimbriefData {
  return {
    airline: 'AIB',
    flightNumber,
    origin: { icao: 'RJAA', iata: 'NRT' },
    destination: { icao: 'LFBO', iata: 'TLS' },
    times: { schedOut },
  } as unknown as ISimbriefData;
}

describe('LOAD BOX electronic flight folder', () => {
  it('is labelled like the FLT FOLDER list: flight number, date, city pair', () => {
    expect(oisDate(Date.UTC(2008, 8, 23, 12))).toBe('23-SEP-08');
    expect(effIdentifier(effFromOfp(ofp('406')))).toBe('AIB406 23-SEP-08 NRT-TLS');
  });

  it('is labelled FLT FOLDER, flight number, city pair, date in the EXPORT BOX', () => {
    expect(effExportIdentifier(effFromOfp(ofp('406')))).toBe('FLT FOLDER AIB406 NRT-TLS 23-SEP-08');
  });

  it('writes the date in mixed case in the FLT FOLDER label', () => {
    expect(effFolderLabel(effFromOfp(ofp('406')))).toBe('AIB406 23-Sep-08 NRT-TLS');
  });

  it('takes the ICAO codes without IATA codes, and no date without a scheduled departure', () => {
    const noIata = { ...ofp('406', ''), origin: { icao: 'RJAA', iata: '' }, destination: { icao: 'LFBO' } };
    expect(effIdentifier(effFromOfp(noIata as unknown as ISimbriefData))).toBe('AIB406 RJAA-LFBO');
  });
});

describe('LOAD BOX', () => {
  it('adds the OFP from the ground once, and only with the network', async () => {
    const box = new OisLoadBox(() => Promise.resolve(ofp('406')));
    await box.refresh(false);
    expect(box.items.get()).toHaveLength(0);
    await box.refresh(true);
    await box.refresh(true);
    expect(box.items.get()).toHaveLength(1);
    expect(box.items.get()[0].destination).toBe('FLT FOLDER');
    expect(box.items.get()[0].status).toEqual({ CAPT: 'NOT LOADED', FO: 'NOT LOADED', BACKUP: 'NOT LOADED' });
  });

  it('keeps the list when the ground has no OFP', async () => {
    const box = new OisLoadBox(() => Promise.reject(new Error('no SimBrief user')));
    await box.refresh(true);
    expect(box.items.get()).toHaveLength(0);
    expect(box.refreshing.get()).toBe(false);
  });

  it('loads the ticked items into every laptop on the network', async () => {
    const box = new OisLoadBox(() => Promise.resolve(ofp('406')));
    await box.refresh(true);
    expect(box.items.get()[0].selected).toBe(false);
    box.toggle(0);
    box.load('FO', true, true);
    const item = box.items.get()[0];
    expect(item.status).toEqual({ CAPT: 'LOADED', FO: 'LOADED', BACKUP: 'LOADED' });
    expect(item.selected).toBe(false);
    expect(box.loaded.get().map((item) => item.eff.flightNumber)).toEqual(['AIB406']);
    expect(box.loaded.get()[0].ofp.flightNumber).toBe('406');
  });

  it('leaves a laptop that is off, or every other laptop of a stand-alone laptop, NOT LOADED until loaded again', async () => {
    const box = new OisLoadBox(() => Promise.resolve(ofp('406')));
    await box.refresh(true);
    box.toggle(0);
    box.load('CAPT', true, false);
    expect(box.items.get()[0].status).toEqual({ CAPT: 'LOADED', FO: 'NOT LOADED', BACKUP: 'LOADED' });
    box.toggle(0);
    box.load('CAPT', true, true);
    expect(box.items.get()[0].status.FO).toBe('LOADED');

    const standalone = new OisLoadBox(() => Promise.resolve(ofp('407')));
    await standalone.refresh(true);
    standalone.toggleAll();
    standalone.load('CAPT', false, true);
    expect(standalone.items.get()[0].status).toEqual({ CAPT: 'LOADED', FO: 'NOT LOADED', BACKUP: 'NOT LOADED' });
  });

  it('ticks all rows with the title tick box, and removes rows with the recycle bins', async () => {
    let flight = 400;
    const box = new OisLoadBox(() => Promise.resolve(ofp(`${flight++}`)));
    await box.refresh(true);
    await box.refresh(true);
    await box.refresh(true);
    box.toggleAll();
    expect(box.allSelected()).toBe(true);
    box.toggleAll();
    expect(box.items.get().some((item) => item.selected)).toBe(false);
    box.remove(1);
    expect(box.items.get().map((item) => item.eff.flightNumber)).toEqual(['AIB400', 'AIB402']);
    box.removeAll();
    expect(box.items.get()).toHaveLength(0);
  });

  it('replaces an OFP of the same flight by a newer one, which has to be loaded again', async () => {
    let generated = 100;
    const box = new OisLoadBox(() => Promise.resolve({ ...ofp('406'), generatedTime: generated } as ISimbriefData));
    await box.refresh(true);
    box.toggle(0);
    box.load('CAPT', true, true);
    await box.refresh(true);
    expect(box.items.get()).toHaveLength(1);
    generated = 200;
    await box.refresh(true);
    expect(box.items.get()).toHaveLength(1);
    expect(box.items.get()[0].generatedMs).toBe(200000);
    expect(box.items.get()[0].status.CAPT).toBe('NOT LOADED');
  });

  it('tells the other laptops what the crew loaded, when it is on the network', async () => {
    const told: string[] = [];
    const box = new OisLoadBox(
      () => Promise.resolve(ofp('406')),
      (items) => items.forEach((item) => told.push(item.identifier)),
    );
    await box.refresh(true);
    box.toggle(0);
    box.load('CAPT', false, true);
    expect(told).toEqual([]);
    box.toggle(0);
    box.load('CAPT', true, true);
    expect(told).toEqual(['AIB406 23-SEP-08 NRT-TLS']);
  });
});

describe('LOAD BOX load from the offside laptop', () => {
  const identifier = 'AIB406 23-SEP-08 NRT-TLS';
  const generated = (seconds: number) => () =>
    Promise.resolve({ ...ofp('406'), generatedTime: seconds } as unknown as ISimbriefData);

  it('loads the OFP it fetches itself when it is the one the other laptop loaded', async () => {
    const box = new OisLoadBox(generated(100));
    await box.loadFromOffside(identifier, 100000, 'FO', true);
    expect(box.items.get()[0].status).toEqual({ CAPT: 'LOADED', FO: 'LOADED', BACKUP: 'LOADED' });
    expect(box.loaded.get()).toHaveLength(1);
  });

  it('stays NOT LOADED when the ground gives another OFP, or none', async () => {
    const other = new OisLoadBox(generated(150));
    await other.loadFromOffside(identifier, 100000, 'FO', true);
    expect(other.items.get()[0].status.FO).toBe('NOT LOADED');
    expect(other.loaded.get()).toHaveLength(0);

    const standalone = new OisLoadBox(generated(100));
    await standalone.loadFromOffside(identifier, 100000, 'FO', false);
    expect(standalone.items.get()).toHaveLength(0);
    expect(standalone.loaded.get()).toHaveLength(0);
  });

  it('waits for a refresh that is running instead of dropping the load from the other laptop', async () => {
    const box = new OisLoadBox(() =>
      Promise.resolve({ ...ofp('406'), generatedTime: 100 } as unknown as ISimbriefData),
    );
    const running = box.refresh(true);
    await box.loadFromOffside('AIB406 23-SEP-08 NRT-TLS', 100000, 'FO', true);
    await running;
    expect(box.loaded.get()).toHaveLength(1);
  });
});
