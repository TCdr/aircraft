// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { AtsuMessageDirection, AtsuStatusCodes, FreetextMessage } from '../../common/src';
import { RouterAtcAocMessages } from '../../router/src';
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

describe('AOC company messages while the AOC is off', () => {
  /**
   * @param text the message
   * @returns a company free text from the ground
   */
  function groundMessage(text: string): FreetextMessage {
    const message = new FreetextMessage();
    message.Direction = AtsuMessageDirection.Uplink;
    message.Station = 'KLMOPS';
    message.Message = text;
    return message;
  }

  /** An AOC whose COMPANY MSG count the test reads */
  function aocWithCount() {
    const bus = new EventBus();
    const aoc = new Aoc(bus, false);
    aoc.initialize();
    const counts: number[] = [];
    (
      aoc as unknown as { digitalOutputs: { setCompanyMessageCount: (count: number) => void } }
    ).digitalOutputs.setCompanyMessageCount = (count) => counts.push(count);
    const unreadCount = () => (counts.length > 0 ? counts[counts.length - 1] : 0);
    return { aoc, router: bus.getPublisher<RouterAtcAocMessages>(), unreadCount };
  }

  it('receives the company messages only while powered', () => {
    const { aoc, router, unreadCount } = aocWithCount();
    router.pub('routerReceivedFreetextMessage', groundMessage('WHILE OFF'));
    expect(unreadCount()).toBe(0);

    aoc.powerUp();
    router.pub('routerReceivedFreetextMessage', groundMessage('WHILE ON'));
    expect(unreadCount()).toBe(1);
  });

  it('leaves no unread message for the COMPANY MSG memo once powered down', () => {
    const { aoc, router, unreadCount } = aocWithCount();
    aoc.powerUp();
    router.pub('routerReceivedFreetextMessage', groundMessage('HELLO'));
    expect(unreadCount()).toBe(1);

    aoc.powerDown();
    expect(unreadCount()).toBe(0);
  });
});
