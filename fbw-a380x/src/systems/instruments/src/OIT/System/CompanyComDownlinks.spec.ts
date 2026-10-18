// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { CompanyComDownlinks, CompanyComDownlinkStatus, downlinkPrintText } from './CompanyComDownlinks';

/**
 * The downlink store of an OIT, with a clock the test sets
 * @returns the store, the bus, and the clock
 */
function setup() {
  const bus = new EventBus();
  const clock = { now: 1_000 };
  const downlinks = new CompanyComDownlinks(bus, () => clock.now);
  downlinks.init();
  return { bus, clock, downlinks };
}

/*
 * The AOC stores the messages in the sent, inbox and outbox folders, and deletes the whole mailbox at the end of each
 * flight. A request shows in Sent once the ground acknowledges it.
 */
describe('COMPANY COM Outbox and Sent', () => {
  it('puts a sent message in the Outbox, then in Sent once the ground acknowledges it', () => {
    const { clock, downlinks } = setup();
    const id = downlinks.recordDownlink({ subject: 'FREE TEXT', to: 'DLH400', text: 'HELLO' });
    expect(downlinks.outbox.get().map((d) => [d.id, d.status, d.createdAt])).toEqual([
      [id, CompanyComDownlinkStatus.Sending, 1_000],
    ]);
    expect(downlinks.sent.get()).toEqual([]);

    clock.now = 5_000;
    downlinks.markSent(id);
    expect(downlinks.outbox.get()).toEqual([]);
    expect(downlinks.sent.get().map((d) => [d.id, d.sentAt])).toEqual([[id, 5_000]]);
  });

  it('keeps a message that could not be sent in the Outbox, NOT SENT', () => {
    const { downlinks } = setup();
    const id = downlinks.recordDownlink({ subject: 'FREE TEXT', to: 'DLH400', text: 'HELLO' });
    downlinks.markNotSent(id);
    expect(downlinks.outbox.get().map((d) => d.status)).toEqual([CompanyComDownlinkStatus.NotSent]);
  });

  it('keeps an acknowledged message in Sent when a failure follows', () => {
    const { downlinks } = setup();
    const id = downlinks.recordDownlink({ subject: 'WEATHER REQUEST METAR', to: '', text: 'LFPG' });
    downlinks.markSent(id);
    downlinks.markNotSent(id);
    expect(downlinks.sent.get().map((d) => d.id)).toEqual([id]);
    expect(downlinks.outbox.get()).toEqual([]);
  });

  it('lists the newest first', () => {
    const { downlinks } = setup();
    downlinks.recordDownlink({ subject: 'A', to: '', text: '' });
    downlinks.recordDownlink({ subject: 'B', to: '', text: '' });
    expect(downlinks.outbox.get().map((d) => d.subject)).toEqual(['B', 'A']);
  });

  it('deletes the whole mailbox at the end of the flight', () => {
    const { bus, downlinks } = setup();
    downlinks.markSent(downlinks.recordDownlink({ subject: 'A', to: '', text: '' }));
    downlinks.recordDownlink({ subject: 'B', to: '', text: '' });
    bus.getPublisher<any>().pub('aocResetData', true);
    expect(downlinks.downlinks.get()).toEqual([]);
  });

  it('PRINT sends a downlink to the pedestal printer', () => {
    const { bus, downlinks } = setup();
    const printed: string[] = [];
    bus
      .getSubscriber<any>()
      .on('aocPrintMessage')
      .handle((text: string) => printed.push(text));
    const id = downlinks.recordDownlink({ subject: 'FREE TEXT', to: 'DLH400', text: 'HELLO' });
    const format = () => '12-OCT 13:05';

    expect(downlinks.printDownlink(id, format)).toBe(true);
    expect(printed).toEqual([downlinkPrintText(downlinks.downlinks.get()[0], format)]);
    expect(printed[0]).toContain('TO : DLH400');
    expect(printed[0]).toContain('STATUS : SENDING');
    expect(printed[0]).toContain('HELLO');
    expect(downlinks.printDownlink(99, format)).toBe(false);
  });
});
