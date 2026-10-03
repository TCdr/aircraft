// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import {
  AtsuMailboxMessages,
  AtsuMessageDirection,
  AtsuMessageType,
  CpdlcMessage,
  MailboxStatusMessage,
} from '../../../common/src';
import { Atc } from '../ATC';
import { MailboxBus } from './MailboxBus';

/** A prepared downlink, as the MFD ATC COM pages hand it to the mailbox */
function downlink(uid: number): CpdlcMessage {
  const message = new CpdlcMessage();
  message.UniqueMessageID = uid;
  message.Direction = AtsuMessageDirection.Downlink;
  message.Type = AtsuMessageType.CPDLC;
  message.MailboxRelevantMessage = true;
  return message;
}

/** The parts of the ATC function the mailbox uses here; removeMessage calls back into the mailbox like the real one */
function setup() {
  const bus = new EventBus();
  let messages: CpdlcMessage[] = [];
  const atc = {
    messages: () => messages,
    removeMessage: (uid: number) => {
      const before = messages.length;
      messages = messages.filter((m) => m.UniqueMessageID !== uid);
      if (messages.length !== before) {
        mailbox.dequeue(uid);
      }
      return messages.length !== before;
    },
    digitalInputs: { addDataCallback: () => {} },
    digitalOutputs: { activateButton: () => {}, sendSystemStatus: () => {}, activateAtcRing: () => {} },
  } as unknown as Atc;
  // removeMessage above only runs once the mailbox exists
  const mailbox = new MailboxBus(bus, atc);

  const statuses: MailboxStatusMessage[] = [];
  const shown: number[] = [];
  const sub = bus.getSubscriber<AtsuMailboxMessages>();
  sub.on('systemStatus').handle((s) => statuses.push(s));
  sub.on('cpdlcMessages').handle((m) => shown.push(...m.map((x) => x.UniqueMessageID)));
  const send = (uid: number) => {
    const message = downlink(uid);
    messages.push(message);
    mailbox.enqueue([message]);
  };
  // the A380X SD mailbox CANCEL of a prepared downlink
  const cancel = (uid: number) => bus.getPublisher<AtsuMailboxMessages>().pub('deleteMessage', uid, true, false);
  return { send, cancel, statuses, shown };
}

describe('MailboxBus downlink file (A380 FCOM DSC-46, FILE FULL)', () => {
  it('holds a sixth open downlink back with FILE FULL', () => {
    const { send, statuses, shown } = setup();
    [1, 2, 3, 4, 5, 6].forEach(send);
    expect(shown).toEqual([1, 2, 3, 4, 5]);
    expect(statuses).toContain(MailboxStatusMessage.MaximumDownlinkMessages);
  });

  it('gives the place of a cancelled downlink to the held one, and FILE FULL goes', () => {
    const { send, cancel, statuses, shown } = setup();
    [1, 2, 3, 4, 5, 6].forEach(send);
    cancel(1);
    expect(shown).toEqual([1, 2, 3, 4, 5, 6]);
    expect(statuses[statuses.length - 1]).toBe(MailboxStatusMessage.NoMessage);
  });

  it('never fills up from cancelled downlinks (in-sim 2026-10-02: FILE FULL for good after five cancels)', () => {
    const { send, cancel, statuses } = setup();
    for (let uid = 1; uid <= 10; uid++) {
      send(uid);
      cancel(uid);
    }
    expect(statuses).not.toContain(MailboxStatusMessage.MaximumDownlinkMessages);
  });
});
