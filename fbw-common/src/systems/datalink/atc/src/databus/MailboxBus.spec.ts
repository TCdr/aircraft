// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import {
  AtsuMailboxMessages,
  AtsuMessageDirection,
  AtsuMessageType,
  CpdlcMessage,
  MailboxSnapshot,
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
    currentStation: () => 'EDYY',
    updateShownMessageInMailbox: () => {},
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
  // an uplink message of the ATC center
  const receive = (uid: number) => {
    const message = downlink(uid);
    message.Direction = AtsuMessageDirection.Uplink;
    messages.push(message);
    mailbox.enqueue([message]);
  };
  const publisher = bus.getPublisher<AtsuMailboxMessages>();
  const snapshots: MailboxSnapshot[] = [];
  sub.on('mailboxSnapshot').handle((s) => snapshots.push(s));
  // a mailbox client that asks for the whole mailbox file
  const resync = () => publisher.pub('mailboxResyncRequest', true, true, false);
  return { mailbox, publisher, send, receive, cancel, resync, statuses, shown, snapshots };
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

describe('MailboxBus resync (A380X SD mailbox on another DU, FCOM PRO-ABN-ECAM-10-31: "If the SD DU is turned OFF, use the F/O DU RECONF P/B for ATC mailbox")', () => {
  beforeEach(() => {
    // the ring tone interval of an unread uplink message
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const uids = (snapshot: MailboxSnapshot) => snapshot.blocks.map((block) => block.messages[0].UniqueMessageID);

  it('answers a resync request with the whole file, the displayed message and the ATC center', () => {
    const { mailbox, publisher, send, receive, resync, snapshots } = setup();
    mailbox.powerUp();
    send(1);
    receive(2);
    send(3);
    publisher.pub('visibleMessage', 2, true, false);
    resync();
    expect(snapshots).toHaveLength(1);
    expect(uids(snapshots[0])).toEqual([1, 2, 3]);
    expect(snapshots[0].visibleUid).toBe(2);
    expect(snapshots[0].activeAtc).toBe('EDYY');
  });

  it('gives the information of each block', () => {
    const { mailbox, send, resync, snapshots } = setup();
    mailbox.powerUp();
    send(1);
    send(2);
    mailbox.updateMessageStatus(2, MailboxStatusMessage.Sending);
    resync();
    expect(snapshots[0].blocks.map((block) => block.status)).toEqual([
      MailboxStatusMessage.NoMessage,
      MailboxStatusMessage.Sending,
    ]);
  });

  it('leaves out a block that left the file', () => {
    const { mailbox, send, cancel, resync, snapshots } = setup();
    mailbox.powerUp();
    send(1);
    send(2);
    cancel(1);
    resync();
    expect(uids(snapshots[0])).toEqual([2]);
  });

  it('puts a held downlink after the blocks it waited behind, in the order it entered the mailbox', () => {
    const { mailbox, send, cancel, resync, snapshots } = setup();
    mailbox.powerUp();
    [1, 2, 3, 4, 5, 6].forEach(send);
    cancel(1);
    resync();
    expect(uids(snapshots[0])).toEqual([2, 3, 4, 5, 6]);
  });

  it('keeps the order of arrival across the uplink and downlink files', () => {
    const { mailbox, send, receive, resync, snapshots } = setup();
    mailbox.powerUp();
    receive(1);
    send(2);
    receive(3);
    resync();
    expect(uids(snapshots[0])).toEqual([1, 2, 3]);
  });

  it('does not answer while the ATC function is unpowered', () => {
    const { send, resync, snapshots } = setup();
    send(1);
    resync();
    expect(snapshots).toHaveLength(0);
  });
});
