// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { EventBus } from '@microsoft/msfs-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Aoc } from '@datalink/aoc';
import { AtsuMessageDirection, AtsuTimestamp, FreetextMessage } from '@datalink/common';
import {
  aocPrintText,
  atsuTimestampToUtcMs,
  CompanyComInboxEntry,
  CompanyComMailbox,
  inboxEntryOf,
  upsertInboxEntry,
} from './CompanyComMailbox';

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

/*
 * A380 FCOM DSC-46-40 AOC (a380_fcom.txt l.107994-107996): "The flight crew uses the OIT display to: - Access the AOC
 * application - Display, edit, print, send, delete, and/or store AOC messages"; l.108020-108023 COMPANY MSG: "The flight
 * crew received a company message. No longer appears, when the flight crew read all the received messages."
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

  it('still receives the uplinks while the AOC downlinks are inhibited (NSS DATA TO AVNCS OFF, l.103225-103226)', () => {
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

  it('PRINT sends the displayed message to the pedestal printer (DSC-46-40-10-20 l.107938-107939)', () => {
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

  it('the inbox page has the PRINT button', () => {
    const page = readFileSync(resolve(__dirname, '../Pages/NssAvncs/CompanyCom/OitAvncsCompanyComInbox.tsx'), 'utf-8');
    expect(page).toContain('label="PRINT"');
    expect(page).toContain('this.mailbox.printMessage(uid, AnsuOps.formatDateTime)');
  });

  it('is the inbox page of the OIT, with no hard-coded test message left', () => {
    const page = readFileSync(resolve(__dirname, '../Pages/NssAvncs/CompanyCom/OitAvncsCompanyComInbox.tsx'), 'utf-8');
    expect(page).toContain('this.props.container.ansu.companyCom');
    expect(page).not.toContain('TEST MESSAGE');
  });
});
