// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, FSComponent, Subject } from '@microsoft/msfs-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Aoc } from '@datalink/aoc';
import { AtsuMessageDirection, AtsuTimestamp, FreetextMessage } from '@datalink/common';
import { fakeUiService, withStandIns } from '../OitSpecSupport';
import { OitAvncsCompanyComInbox } from '../Pages/NssAvncs/CompanyCom/OitAvncsCompanyComInbox';
import {
  aocPrintText,
  atsuTimestampToUtcMs,
  CompanyComInboxEntry,
  CompanyComMailbox,
  inboxEntryOf,
  upsertInboxEntry,
} from './CompanyComMailbox';

// The EcamMessages tables and enums import each other, so the pages cannot load the real index
vi.mock('../../MsfsAvionicsCommon/EcamMessages', () => ({
  EcamAbnormalProcedures: {},
  ChecklistLineStyle: {},
  EcamAbnormalSensedProcedures: {},
}));

/**
 * A company uplink: a free text message from the ground station.
 * @param text the message text
 * @param uid the AOC message id
 * @returns the message
 */
function uplink(text: string, uid = -1): FreetextMessage {
  const message = new FreetextMessage();
  message.Direction = AtsuMessageDirection.Uplink;
  message.Station = 'KLMOPS';
  message.Message = text;
  message.UniqueMessageID = uid;
  return message;
}

/**
 * The inbox entry of an uplink, which must exist.
 * @param message the uplink
 * @returns the inbox entry
 */
function entryOf(message: FreetextMessage): CompanyComInboxEntry {
  const entry = inboxEntryOf(message);
  if (entry === null) {
    throw new Error('no inbox entry for an uplink');
  }
  return entry;
}

/** The sim variables written during a test (the datalink modules replace the global SimVar mock functions) */
let simVars: Map<string, any>;

/**
 * The unread company message count the AOC gives the FWS for the COMPANY MSG memo.
 * @returns the count
 */
function companyMessageCount(): number {
  return simVars.get('L:A32NX_COMPANY_MSG_COUNT') ?? 0;
}

const { GetSimVarValue, SetSimVarValue } = SimVar;

beforeEach(() => {
  simVars = new Map<string, any>();
  SimVar.GetSimVarValue = (name: string) => simVars.get(name) ?? 0;
  SimVar.SetSimVarValue = (name: string, _unit: string, value: any) => {
    simVars.set(name, value);
    return Promise.resolve();
  };
});

afterEach(() => {
  SimVar.GetSimVarValue = GetSimVarValue;
  SimVar.SetSimVarValue = SetSimVarValue;
});

/**
 * Draws the COMPANY COM inbox page over a mailbox on a bus, as the OIT does.
 * @returns the page content, the mailbox, the bus and the page functions the page registered
 */
function drawInbox() {
  const bus = new EventBus();
  const mailbox = new CompanyComMailbox(bus);
  mailbox.init();
  const { uiService } = fakeUiService();
  const registered: { print: { run: () => void; available: Subject<boolean> } } = {} as any;
  (uiService as any).registerPageFunctions = (functions: typeof registered) => Object.assign(registered, functions);
  const container = withStandIns({
    ansu: withStandIns({ companyCom: mailbox, sci: withStandIns({ fltNumber: Subject.create('KLM123') }) }),
  });
  const root = document.createElement('div');
  FSComponent.render(<OitAvncsCompanyComInbox bus={bus} uiService={uiService} container={container} />, root);
  return { root, mailbox, bus, registered };
}

/*
 * On the OIT the flight crew can display, edit, print, send, delete and store AOC messages; the COMPANY MSG memo goes
 * once all the received messages are read.
 */
describe('OIT COMPANY COM inbox', () => {
  it('lists the AOC uplinks, newest first, and not the downlinks', () => {
    const first = entryOf(uplink('FIRST', 1));
    const second = entryOf(uplink('SECOND', 2));
    expect(upsertInboxEntry(upsertInboxEntry([], first), second).map((e) => e.text)).toEqual(['SECOND', 'FIRST']);

    const downlink = uplink('REQUEST');
    downlink.Direction = AtsuMessageDirection.Downlink;
    expect(inboxEntryOf(downlink)).toBeNull();
  });

  it('replaces a changed message in place', () => {
    const entry = entryOf(uplink('TEXT', 7));
    const other = entryOf(uplink('OTHER', 8));
    const inbox = upsertInboxEntry(upsertInboxEntry([], entry), other);
    expect(upsertInboxEntry(inbox, { ...entry, read: true }).map((e) => [e.uid, e.read])).toEqual([
      [8, false],
      [7, true],
    ]);
  });

  it('shows the sender in the subject and the UTC reception time', () => {
    const message = uplink('GATE CHANGE B32');
    const timestamp = new AtsuTimestamp();
    timestamp.Year = 2026;
    timestamp.Month = 10;
    timestamp.Day = 12;
    timestamp.Seconds = 13 * 3600 + 5 * 60;
    message.Timestamp = timestamp;
    const entry = entryOf(message);
    expect(entry.subject).toBe('FREE TEXT KLMOPS');
    expect(entry.text).toBe('GATE CHANGE B32');
    expect(new Date(entry.receivedAt ?? 0).toISOString()).toBe('2026-10-12T13:05:00.000Z');
    expect(atsuTimestampToUtcMs(new AtsuTimestamp())).toBeNull();
  });

  it('gets the uplinks from the AOC, and reading them all clears the COMPANY MSG count', () => {
    const bus = new EventBus();
    const aoc = new Aoc(bus, false);
    aoc.initialize();
    aoc.powerUp();
    const mailbox = new CompanyComMailbox(bus);
    mailbox.init();

    // the router delivers two company messages to the AOC
    bus.getPublisher<any>().pub('routerReceivedFreetextMessage', uplink('LOADSHEET FOLLOWS'));
    bus.getPublisher<any>().pub('routerReceivedFreetextMessage', uplink('GATE CHANGE B32'));

    const inbox = mailbox.messages.getArray();
    expect(inbox.map((e) => e.text)).toEqual(['GATE CHANGE B32', 'LOADSHEET FOLLOWS']);
    expect(inbox.every((e) => !e.read)).toBe(true);
    expect(companyMessageCount()).toBe(2);

    mailbox.markRead(inbox[0].uid);
    expect(companyMessageCount()).toBe(1);
    mailbox.markRead(mailbox.messages.get(1).uid);
    expect(companyMessageCount()).toBe(0);
    expect(mailbox.messages.getArray().every((e) => e.read)).toBe(true);
  });

  it('drops a message the AOC deletes', () => {
    const bus = new EventBus();
    const mailbox = new CompanyComMailbox(bus);
    mailbox.init();
    bus.getPublisher<any>().pub('aocResynchronizeFreetextMessage', uplink('A', 3));
    expect(mailbox.messages.length).toBe(1);
    bus.getPublisher<any>().pub('aocDeleteMessage', 3);
    expect(mailbox.messages.length).toBe(0);
  });

  it('still receives the uplinks while the AOC downlinks are inhibited (NSS DATA TO AVNCS OFF)', () => {
    const bus = new EventBus();
    const aoc = new Aoc(bus, false);
    aoc.initialize();
    aoc.powerUp();
    aoc.setDownlinksInhibited(true);
    const mailbox = new CompanyComMailbox(bus);
    mailbox.init();
    bus.getPublisher<any>().pub('routerReceivedFreetextMessage', uplink('GATE CHANGE B32'));
    expect(mailbox.messages.getArray().map((e) => e.text)).toEqual(['GATE CHANGE B32']);
  });

  it('PRINT sends the displayed message to the pedestal printer', () => {
    const bus = new EventBus();
    const mailbox = new CompanyComMailbox(bus);
    mailbox.init();
    const printed: string[] = [];
    bus
      .getSubscriber<any>()
      .on('aocPrintMessage')
      .handle((text: string) => printed.push(text));
    bus.getPublisher<any>().pub('aocResynchronizeFreetextMessage', uplink('LOADSHEET FOLLOWS', 4));
    const format = () => '12-OCT 13:05';

    expect(mailbox.printMessage(4, format)).toBe(true);
    expect(printed).toEqual([aocPrintText(mailbox.messages.get(0), format)]);
    expect(printed[0]).toContain('FROM : KLMOPS');
    expect(printed[0]).toContain('LOADSHEET FOLLOWS');
    expect(mailbox.printMessage(99, format)).toBe(false);
    expect(printed.length).toBe(1);
  });

  it('the inbox page prints the displayed message with PRINT of the menu bar', () => {
    const { mailbox, bus, registered } = drawInbox();
    const printed: string[] = [];
    bus
      .getSubscriber<any>()
      .on('aocPrintMessage')
      .handle((text: string) => printed.push(text));
    bus.getPublisher<any>().pub('aocResynchronizeFreetextMessage', uplink('LOADSHEET FOLLOWS', 4));

    expect(registered.print.available.get()).toBe(false);
    registered.print.run();
    expect(printed).toEqual([]);

    mailbox.display(4);
    expect(registered.print.available.get()).toBe(true);
    registered.print.run();
    expect(printed.length).toBe(1);
    expect(printed[0]).toContain('LOADSHEET FOLLOWS');
  });

  it('counts the messages not read yet for the Inbox folder', () => {
    const bus = new EventBus();
    const mailbox = new CompanyComMailbox(bus);
    mailbox.init();
    bus.getPublisher<any>().pub('aocResynchronizeFreetextMessage', uplink('A', 1));
    bus.getPublisher<any>().pub('aocResynchronizeFreetextMessage', uplink('B', 2));
    expect(mailbox.unreadCount.get()).toBe(2);

    mailbox.display(2);
    expect(mailbox.displayedUid.get()).toBe(2);
    expect(mailbox.unreadCount.get()).toBe(1);

    bus.getPublisher<any>().pub('aocDeleteMessage', 2);
    expect(mailbox.displayedUid.get()).toBeNull();
    expect(mailbox.unreadCount.get()).toBe(1);
  });

  it('announces each new unread uplink once, and when it is read or deleted', () => {
    const bus = new EventBus();
    const mailbox = new CompanyComMailbox(bus);
    mailbox.init();
    const announced: number[] = [];
    const handled: number[] = [];
    mailbox.onNewUplink((entry) => announced.push(entry.uid));
    mailbox.onUplinkHandled((uid) => handled.push(uid));

    bus.getPublisher<any>().pub('aocResynchronizeFreetextMessage', uplink('A', 1));
    bus.getPublisher<any>().pub('aocResynchronizeFreetextMessage', uplink('A CHANGED', 1));
    bus.getPublisher<any>().pub('aocResynchronizeFreetextMessage', uplink('B', 2));
    bus.getPublisher<any>().pub('aocResynchronizeFreetextMessage', uplink('C', 3));
    const alreadyRead = uplink('READ ELSEWHERE', 4);
    alreadyRead.Confirmed = true;
    bus.getPublisher<any>().pub('aocResynchronizeFreetextMessage', alreadyRead);
    expect(announced).toEqual([1, 2, 3]);

    // read on this OIT, read on the other OIT (the AOC sends it back read), deleted
    mailbox.display(1);
    const readOnOtherOit = uplink('B', 2);
    readOnOtherOit.Confirmed = true;
    bus.getPublisher<any>().pub('aocResynchronizeFreetextMessage', readOnOtherOit);
    bus.getPublisher<any>().pub('aocDeleteMessage', 3);
    expect(handled).toEqual([1, 2, 3]);

    // the end of the flight deletes the whole mailbox
    bus.getPublisher<any>().pub('aocResynchronizeFreetextMessage', uplink('D', 5));
    mailbox.display(5);
    bus.getPublisher<any>().pub('aocResynchronizeFreetextMessage', uplink('E', 6));
    bus.getPublisher<any>().pub('aocResetData', true);
    expect(handled).toEqual([1, 2, 3, 5, 6]);
    expect(mailbox.displayedUid.get()).toBeNull();
    expect(mailbox.messages.length).toBe(0);
  });

  it('is the inbox page of the OIT, with no hard-coded test message left', () => {
    const { root, bus, mailbox } = drawInbox();
    expect(root.textContent).not.toContain('TEST MESSAGE');
    bus.getPublisher<any>().pub('aocResynchronizeFreetextMessage', uplink('GATE CHANGE B32', 7));
    mailbox.display(7);
    expect(root.textContent).toContain('GATE CHANGE B32');
  });
});
