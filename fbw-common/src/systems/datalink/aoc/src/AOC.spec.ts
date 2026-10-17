// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { AtsuStatusCodes, FreetextMessage } from '../../common/src';
import { Aoc } from './AOC';

/** The private parts of the AOC the tests drive */
interface AocInternals {
  digitalOutputs: {
    sendMessage: (...args: unknown[]) => Promise<AtsuStatusCodes>;
    receiveMetar: (...args: unknown[]) => Promise<[AtsuStatusCodes, null]>;
  };
  sendMessage(message: FreetextMessage): Promise<AtsuStatusCodes>;
  receiveWeather(requestMetar: boolean, icaos: string[], sentCallback: () => void): Promise<[AtsuStatusCodes, null]>;
  insertMessages(messages: FreetextMessage[]): void;
}

/** A powered AOC whose router accepts every downlink */
function poweredAoc() {
  const aoc = new Aoc(new EventBus(), false);
  aoc.powerUp();
  const internals = aoc as unknown as AocInternals;
  const sent = vi.fn(() => Promise.resolve(AtsuStatusCodes.Ok));
  const metar = vi.fn(() => Promise.resolve([AtsuStatusCodes.Ok, null] as [AtsuStatusCodes, null]));
  internals.digitalOutputs.sendMessage = sent;
  internals.digitalOutputs.receiveMetar = metar;
  // the sent message is stored in the outbox, not needed here
  internals.insertMessages = () => {};
  return { aoc, internals, sent, metar };
}

// A380 NSS DATA TO AVNCS pb-sw OFF: the AOC can no longer send to the ground but still receives
describe('AOC downlink inhibition', () => {
  it('sends the messages and requests normally', async () => {
    const { internals, sent, metar } = poweredAoc();
    expect(await internals.sendMessage(new FreetextMessage())).toBe(AtsuStatusCodes.Ok);
    expect((await internals.receiveWeather(true, ['EGLL'], () => {}))[0]).toBe(AtsuStatusCodes.Ok);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(metar).toHaveBeenCalledTimes(1);
  });

  it('sends nothing to the ground while the downlinks are inhibited, and again once released', async () => {
    const { aoc, internals, sent, metar } = poweredAoc();
    aoc.setDownlinksInhibited(true);
    expect(await internals.sendMessage(new FreetextMessage())).toBe(AtsuStatusCodes.ComFailed);
    expect((await internals.receiveWeather(true, ['EGLL'], () => {}))[0]).toBe(AtsuStatusCodes.ComFailed);
    expect(sent).not.toHaveBeenCalled();
    expect(metar).not.toHaveBeenCalled();

    aoc.setDownlinksInhibited(false);
    expect(await internals.sendMessage(new FreetextMessage())).toBe(AtsuStatusCodes.Ok);
  });
});
