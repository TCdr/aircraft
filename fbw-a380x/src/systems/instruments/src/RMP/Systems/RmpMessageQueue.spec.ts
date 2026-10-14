// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { describe, expect, it } from 'vitest';
import { KeypadEvents, SystemKeys } from './KeypadController';
import { RmpMessageControlEvents, RmpMessageDataEvents, RmpMessageManager } from './RmpMessageManager';
import { RmpMessageQueue } from './RmpMessageQueue';

/*
 * A380 FCOM DSC-23-20 RMP MESSAGES (a380_fcom.txt l.49321-49324): the active messages are stored in a queue in their
 * order of appearance, the RMP displays the most recent one, the crew clears them one by one. Before, a new message
 * overwrote the previous one and MSG CLR emptied the display at once.
 */
describe('RmpMessageQueue', () => {
  it('displays the most recent message and clears the messages one by one', () => {
    const queue = new RmpMessageQueue();
    queue.add('VHF1 FREQ NOT VALID');
    queue.add('SQUAWK CODE NOT VALID');
    expect(queue.displayed).toBe('SQUAWK CODE NOT VALID');
    queue.clearDisplayed();
    expect(queue.displayed).toBe('VHF1 FREQ NOT VALID');
    queue.clearDisplayed();
    expect(queue.displayed).toBeNull();
  });

  it('stores a repeated message once, as the most recent', () => {
    const queue = new RmpMessageQueue();
    queue.add('A');
    queue.add('B');
    queue.add('A');
    expect(queue.length).toBe(2);
    expect(queue.displayed).toBe('A');
    queue.clearDisplayed();
    expect(queue.displayed).toBe('B');
  });

  it('removes a message whose condition is gone wherever it is', () => {
    const queue = new RmpMessageQueue();
    queue.add('TRANSMITTING IDENT');
    queue.add('VHF2 FREQ NOT VALID');
    queue.remove('TRANSMITTING IDENT');
    expect(queue.displayed).toBe('VHF2 FREQ NOT VALID');
    queue.clearDisplayed();
    expect(queue.displayed).toBeNull();
  });

  it('ignores empty messages and a clear with no message', () => {
    const queue = new RmpMessageQueue();
    queue.add('');
    queue.clearDisplayed();
    expect(queue.length).toBe(0);
  });
});

describe('RmpMessageManager', () => {
  /**
   * Creates an RMP message manager on a new bus.
   * @returns the displayed message and the message/MSG CLR inputs
   */
  function setup(): { shown: () => string; set: (m: string) => void; remove: (m: string) => void; clr: () => void } {
    const bus = new EventBus();
    const _manager = new RmpMessageManager(bus, 1);
    let shown = '';
    bus
      .getSubscriber<RmpMessageDataEvents>()
      .on('rmp_message')
      .handle((m) => (shown = m));
    const pub = bus.getPublisher<RmpMessageControlEvents & KeypadEvents>();
    return {
      shown: () => shown,
      set: (m) => pub.pub('rmp_message_set', m),
      remove: (m) => pub.pub('rmp_message_clear_message', m),
      clr: () => pub.pub('keypad_system_key_pressed', SystemKeys.MessageClear),
    };
  }

  it('MSG CLR shows the previous active message, then the background', () => {
    const rmp = setup();
    rmp.set('VHF1 FREQ NOT VALID');
    rmp.set('VHF1 STBY REVERTED TO PREV ENTRY');
    expect(rmp.shown()).toBe('VHF1 STBY REVERTED TO PREV ENTRY');
    rmp.clr();
    expect(rmp.shown()).toBe('VHF1 FREQ NOT VALID');
    rmp.clr();
    expect(rmp.shown()).toBe('');
  });

  it('a message cleared by its system leaves the queue even when not displayed', () => {
    const rmp = setup();
    rmp.set('TRANSMITTING IDENT');
    rmp.set('SQUAWK CODE NOT VALID');
    rmp.remove('TRANSMITTING IDENT');
    expect(rmp.shown()).toBe('SQUAWK CODE NOT VALID');
    rmp.clr();
    expect(rmp.shown()).toBe('');
  });
});
