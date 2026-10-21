//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { AocFmsMessages } from '@datalink/aoc';
import { AtsuMessageDirection, AtsuMessageType, FreetextMessage, MetarMessage } from '@datalink/common';
import { A380AocPrintEvents, AocPrintout } from '@shared/AocPrintout';
import { AocAutoPrint, isAutoPrinted } from './AocAutoPrint';

/**
 * @param uid the AOC message id
 * @param read whether the crew displayed it
 * @returns a received METAR
 */
function metar(uid: number, read = false): MetarMessage {
  const message = new MetarMessage();
  message.UniqueMessageID = uid;
  message.Direction = AtsuMessageDirection.Uplink;
  message.Confirmed = read;
  message.Reports.push({ airport: 'EGLL', report: 'EGLL 201250Z 24012KT 9999 FEW030 15/08 Q1012' });
  return message;
}

/**
 * @param uid the AOC message id
 * @returns a received company free text
 */
function freeText(uid: number): FreetextMessage {
  const message = new FreetextMessage();
  message.UniqueMessageID = uid;
  message.Direction = AtsuMessageDirection.Uplink;
  message.Message = 'HELLO CREW';
  return message;
}

function setUp() {
  const bus = new EventBus();
  const counts: number[] = [];
  const printouts: AocPrintout[] = [];
  bus
    .getSubscriber<A380AocPrintEvents>()
    .on('aocPrintMessage')
    .handle((printout) => printouts.push(typeof printout === 'string' ? { text: printout } : printout));
  new AocAutoPrint(bus, (count) => counts.push(count)).init();
  const aoc = bus.getPublisher<AocFmsMessages>();
  const printer = bus.getPublisher<A380AocPrintEvents>();
  const waitingCount = () => counts[counts.length - 1];
  return { waitingCount, printouts, aoc, printer };
}

describe('AOC automatic printout', () => {
  it('prints the received weather reports, not the company free texts', () => {
    expect(isAutoPrinted(AtsuMessageType.METAR)).toBe(true);
    expect(isAutoPrinted(AtsuMessageType.TAF)).toBe(true);
    expect(isAutoPrinted(AtsuMessageType.ATIS)).toBe(true);
    expect(isAutoPrinted(AtsuMessageType.Freetext)).toBe(false);

    const { printouts, aoc, waitingCount } = setUp();
    aoc.pub('aocResynchronizeFreetextMessage', freeText(1));
    aoc.pub('aocResynchronizeWeatherMessage', metar(2));
    expect(printouts).toHaveLength(1);
    expect(printouts[0].printId).toBe(2);
    expect(printouts[0].text).toContain('METAR EGLL');
    expect(waitingCount()).toBe(1);
  });

  it('prints a message once, not again when it changes', () => {
    const { printouts, aoc } = setUp();
    aoc.pub('aocResynchronizeWeatherMessage', metar(2));
    aoc.pub('aocResynchronizeWeatherMessage', metar(2));
    expect(printouts).toHaveLength(1);
  });

  it('keeps COMPANY MSG:PRNTR until the message is printed', () => {
    const { waitingCount, aoc, printer } = setUp();
    aoc.pub('aocResynchronizeWeatherMessage', metar(2));
    expect(waitingCount()).toBe(1);
    printer.pub('aocPrintoutPrinted', 2);
    expect(waitingCount()).toBe(0);
  });

  it('or until the crew reads it, deletes it, or the mailbox is deleted', () => {
    const { waitingCount, aoc } = setUp();
    aoc.pub('aocResynchronizeWeatherMessage', metar(2));
    aoc.pub('aocResynchronizeWeatherMessage', metar(2, true));
    expect(waitingCount()).toBe(0);

    aoc.pub('aocResynchronizeWeatherMessage', metar(3));
    aoc.pub('aocDeleteMessage', 3);
    expect(waitingCount()).toBe(0);

    aoc.pub('aocResynchronizeWeatherMessage', metar(4));
    aoc.pub('aocResetData', true);
    expect(waitingCount()).toBe(0);
  });

  it('does not print a message already read when it arrives', () => {
    const { printouts, aoc } = setUp();
    aoc.pub('aocResynchronizeWeatherMessage', metar(2, true));
    expect(printouts).toHaveLength(0);
  });
});
