// Copyright (c) 2024-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ConsumerSubject, EventBus, HEvent, MappedSubject, Subject } from '@microsoft/msfs-sdk';
import { KeypadEvents, SystemKeys } from './KeypadController';
import { TransponderEvents } from '../Data/TransponderPublisher';
import { RmpMessageQueue } from './RmpMessageQueue';

export interface RmpMessageControlEvents {
  rmp_message_set: string;
  rmp_message_clear_message: string;
  rmp_message_set_squawk_message: boolean;
}

export interface RmpMessageDataEvents {
  rmp_message: string;
}

export class RmpMessageManager {
  private readonly sub = this.bus.getSubscriber<HEvent & KeypadEvents & RmpMessageControlEvents & TransponderEvents>();
  private readonly pub = this.bus.getPublisher<RmpMessageDataEvents>();

  private readonly squawkMessageEnabled = ConsumerSubject.create(this.sub.on('rmp_message_set_squawk_message'), false);
  private readonly squawkCode = ConsumerSubject.create(this.sub.on('transponder_code_1'), 0);
  private readonly squawkAuto = ConsumerSubject.create(this.sub.on('transponder_auto_1'), false);
  private readonly squawkMessage = MappedSubject.create(
    ([code, auto, enabled]) =>
      enabled ? `SQUAWK : ${code.toString(16).padStart(4, '0')}${auto ? '' : ' - STBY'}` : '',
    this.squawkCode,
    this.squawkAuto,
    this.squawkMessageEnabled,
  );

  private readonly displayedMessage = Subject.create('');

  /** The active messages, the most recent one displayed (FCOM l.49321-49324, see RmpMessageQueue). */
  private readonly queue = new RmpMessageQueue();

  private readonly clearEvent = `RMP_${this.rmpIndex}_MSG_CLR_PRESSED`;

  constructor(
    private readonly bus: EventBus,
    private readonly rmpIndex: 1 | 2 | 3,
  ) {
    this.sub.on('rmp_message_set').handle((msg) => {
      this.queue.add(msg);
      this.updateDisplayedMessage();
    });
    this.sub.on('rmp_message_clear_message').handle((msg) => {
      this.queue.remove(msg);
      this.updateDisplayedMessage();
    });
    this.squawkMessage.sub(() => this.updateDisplayedMessage());

    this.sub.on('keypad_system_key_pressed').handle((k) => {
      if (k === SystemKeys.MessageClear) {
        // one message at a time: the previous active message comes back (l.49321-49324)
        this.queue.clearDisplayed();
        this.updateDisplayedMessage();
      }
    });

    this.displayedMessage.sub((v) => this.pub.pub('rmp_message', v));

    this.squawkMessageEnabled.sub((v) => console.log('squawkMessageEnabled', v));
  }

  /** Shows the most recent active message, or the squawk in the background when no message is active. */
  private updateDisplayedMessage(): void {
    this.displayedMessage.set(this.queue.displayed ?? this.squawkMessage.get());
  }
}
