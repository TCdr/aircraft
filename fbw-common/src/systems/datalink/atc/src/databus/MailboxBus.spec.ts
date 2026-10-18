// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import {
  AtsuMailboxMessages,
  AtsuMessageComStatus,
  AtsuMessageDirection,
  AtsuMessageType,
  CpdlcMessage,
  CpdlcMessagesUplink,
  MailboxSnapshot,
  MailboxStatusMessage,
} from '../../../common/src';
import { Atc } from '../ATC';
import { MailboxBus, UplinkRejectionReason } from './MailboxBus';

/** A prepared downlink, as the MFD ATC COM pages hand it to the mailbox */
function downlink(uid: number): CpdlcMessage {
  const message = new CpdlcMessage();
  message.UniqueMessageID = uid;
  message.Direction = AtsuMessageDirection.Downlink;
  message.Type = AtsuMessageType.CPDLC;
  message.MailboxRelevantMessage = true;
  return message;
}

/**
 * The parts of the ATC function the mailbox uses here; removeMessage calls back into the mailbox like the real one
 * @param a380xMailbox the A380X mailbox rules (A380 FCOM DSC-46-10-20-70 RING timing, DSC-46-10-10 flight phase
 * inhibition, DSC-46-10-10-70 capacity)
 */
function setup(a380xMailbox = false) {
  const bus = new EventBus();
  let messages: CpdlcMessage[] = [];
  let rings = 0;
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
    digitalInputs: { addDataCallback: () => {}, FwcFlightPhase: 0 },
    digitalOutputs: {
      activateButton: () => {},
      resetButton: () => {},
      sendSystemStatus: () => {},
      activateAtcRing: () => rings++,
    },
  } as unknown as Atc;
  // removeMessage above only runs once the mailbox exists
  const mailbox = new MailboxBus(bus, atc, a380xMailbox);

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
  const receive = (uid: number, urgent = false) => {
    const message = downlink(uid);
    message.Direction = AtsuMessageDirection.Uplink;
    if (urgent) {
      const element = CpdlcMessagesUplink.UM20[1].deepCopy();
      element.Urgent = true;
      message.Content.push(element);
    }
    messages.push(message);
    mailbox.enqueue([message]);
  };
  const publisher = bus.getPublisher<AtsuMailboxMessages>();
  const snapshots: MailboxSnapshot[] = [];
  sub.on('mailboxSnapshot').handle((s) => snapshots.push(s));
  // a mailbox client that asks for the whole mailbox file
  const resync = () => publisher.pub('mailboxResyncRequest', true, true, false);
  // the flight crew reads a message on the mailbox
  const read = (uid: number) => publisher.pub('readMessage', uid, true, false);
  // an uplink that requires an answer (CLIMB TO, WILCO/UNABLE), as the ATC function hands it to the mailbox
  const clearance = (uid: number) => {
    const message = downlink(uid);
    message.Direction = AtsuMessageDirection.Uplink;
    message.Content.push(CpdlcMessagesUplink.UM20[1].deepCopy());
    return message;
  };
  const receiveClearance = (uid: number) => {
    const message = clearance(uid);
    messages.push(message);
    mailbox.enqueue([message]);
    return message;
  };
  // the A380 FWS flight phase (FwcFlightPhase)
  const setFlightPhase = (phase: number) => {
    (atc.digitalInputs as unknown as { FwcFlightPhase: number }).FwcFlightPhase = phase;
  };
  return {
    mailbox,
    publisher,
    send,
    receive,
    cancel,
    resync,
    read,
    statuses,
    shown,
    snapshots,
    rings: () => rings,
    clearance,
    receiveClearance,
    setFlightPhase,
  };
}

describe('MailboxBus downlink file (FILE FULL)', () => {
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

  it('never fills up from cancelled downlinks (seen in the sim: FILE FULL for good after five cancels)', () => {
    const { send, cancel, statuses } = setup();
    for (let uid = 1; uid <= 10; uid++) {
      send(uid);
      cancel(uid);
    }
    expect(statuses).not.toContain(MailboxStatusMessage.MaximumDownlinkMessages);
  });
});

describe('MailboxBus resync (A380X SD mailbox moved to another DU by the F/O DU RECONF pb)', () => {
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

describe('MailboxBus RING timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('A380X: rings only if the normal message is not read within 15 s', () => {
    const { mailbox, receive, rings } = setup(true);
    mailbox.powerUp();
    receive(1);
    expect(rings()).toBe(0);
    vi.advanceTimersByTime(14900);
    expect(rings()).toBe(0);
    vi.advanceTimersByTime(100);
    expect(rings()).toBe(1);
  });

  it('A380X: rings only if the urgent message is not read within 5 s', () => {
    const { mailbox, receive, rings } = setup(true);
    mailbox.powerUp();
    receive(1, true);
    vi.advanceTimersByTime(4900);
    expect(rings()).toBe(0);
    vi.advanceTimersByTime(100);
    expect(rings()).toBe(1);
  });

  it('A380X: never rings for a message read in time', () => {
    const { mailbox, receive, read, rings } = setup(true);
    mailbox.powerUp();
    receive(1);
    vi.advanceTimersByTime(10000);
    read(1);
    vi.advanceTimersByTime(60000);
    expect(rings()).toBe(0);
  });

  it('A380X: an urgent message received during the wait of a normal one rings 5 s after its own reception', () => {
    const { mailbox, receive, rings } = setup(true);
    mailbox.powerUp();
    receive(1);
    vi.advanceTimersByTime(8000);
    receive(2, true);
    vi.advanceTimersByTime(4900);
    expect(rings()).toBe(0);
    vi.advanceTimersByTime(100);
    expect(rings()).toBe(1);
  });

  it('A380X: a second normal message does not push back the ring of the first one', () => {
    const { mailbox, receive, rings } = setup(true);
    mailbox.powerUp();
    receive(1);
    vi.advanceTimersByTime(10000);
    receive(2);
    vi.advanceTimersByTime(5000);
    expect(rings()).toBe(1);
  });

  it('A32NX DCDU: rings at once, as before', () => {
    const { mailbox, receive, rings } = setup();
    mailbox.powerUp();
    receive(1);
    expect(rings()).toBe(1);
  });
});

describe('MailboxBus capacity (A380 FCOM DSC-46-10-10-70, a380_fcom.txt l.96601-96606: 5 unanswered uplinks)', () => {
  it('A380X: rejects a sixth uplink that requires an answer while five wait for one', () => {
    const { mailbox, receiveClearance, clearance } = setup(true);
    [1, 2, 3, 4].forEach(receiveClearance);
    expect(mailbox.newUplinkRejection(clearance(5))).toBeNull();
    receiveClearance(5);
    expect(mailbox.newUplinkRejection(clearance(6))).toBe(UplinkRejectionReason.MailboxFull);
  });

  it('A380X: takes the new uplink again once one of the five is answered', () => {
    const { mailbox, receiveClearance, clearance } = setup(true);
    const first = receiveClearance(1);
    [2, 3, 4, 5].forEach(receiveClearance);
    const wilco = new CpdlcMessage();
    wilco.ComStatus = AtsuMessageComStatus.Sent;
    first.Response = wilco;
    expect(mailbox.newUplinkRejection(clearance(6))).toBeNull();
  });

  it('A380X: a new uplink that needs no answer is not of the five (third category, l.96610-96611)', () => {
    const { mailbox, receiveClearance } = setup(true);
    [1, 2, 3, 4, 5].forEach(receiveClearance);
    const information = new CpdlcMessage();
    information.Direction = AtsuMessageDirection.Uplink;
    information.Content.push(CpdlcMessagesUplink.UM162[1].deepCopy());
    expect(mailbox.newUplinkRejection(information)).toBeNull();
  });

  it('A380X: uplinks that need no answer do not fill the five', () => {
    const { mailbox, receive, clearance } = setup(true);
    [1, 2, 3, 4, 5].forEach((uid) => receive(uid));
    expect(mailbox.newUplinkRejection(clearance(6))).toBeNull();
  });

  it('A32NX DCDU: never rejects, the sixth uplink waits for a place as before', () => {
    const { mailbox, receiveClearance, clearance } = setup();
    [1, 2, 3, 4, 5].forEach(receiveClearance);
    expect(mailbox.newUplinkRejection(clearance(6))).toBeNull();
  });
});

describe('MailboxBus flight phase inhibition (A380 FCOM l.95755-95760, l.101523)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('A380X: rejects a new uplink in takeoff (FWS phase 4) and landing (FWS phase 9), takes it in cruise', () => {
    const { mailbox, clearance, setFlightPhase } = setup(true);
    setFlightPhase(4);
    expect(mailbox.newUplinkRejection(clearance(1))).toBe(UplinkRejectionReason.FlightPhase);
    setFlightPhase(9);
    expect(mailbox.newUplinkRejection(clearance(1))).toBe(UplinkRejectionReason.FlightPhase);
    setFlightPhase(8);
    expect(mailbox.newUplinkRejection(clearance(1))).toBeNull();
  });

  it('A380X: no RING during takeoff for a message received before it, the RING comes back after it', () => {
    const { mailbox, receive, rings, setFlightPhase } = setup(true);
    mailbox.powerUp();
    setFlightPhase(2);
    receive(1);
    setFlightPhase(3);
    vi.advanceTimersByTime(60000);
    expect(rings()).toBe(0);
    setFlightPhase(8);
    vi.advanceTimersByTime(15000);
    expect(rings()).toBe(1);
  });

  it('A32NX DCDU: the flight phase changes nothing', () => {
    const { mailbox, receive, rings, clearance, setFlightPhase } = setup();
    mailbox.powerUp();
    setFlightPhase(4);
    expect(mailbox.newUplinkRejection(clearance(1))).toBeNull();
    receive(1);
    expect(rings()).toBe(1);
  });
});
