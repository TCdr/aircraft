// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AocFmsMessages, FmsAocMessages } from '@datalink/aoc';
import {
  AtsuMessage,
  AtsuMessageDirection,
  AtsuMessageSerializationFormat,
  AtsuMessageType,
  AtsuTimestamp,
  Conversion,
} from '@datalink/common';
import { ArraySubject, EventBus, Subject, Subscribable, Subscription } from '@microsoft/msfs-sdk';

/**
 * The COMPANY COM inbox of the OIT (AOC application): the AOC uplink messages, newest first. The AOC application tells
 * the flight crew that an AOC message is received; on the OIT the crew displays, edits, prints, sends, deletes and
 * stores AOC messages; the COMPANY MSG memo goes once all the received messages are read.
 *
 * The AOC (fbw-common datalink, run by the systems host) owns the messages: it publishes every new or changed message
 * (aocResynchronize*Message) and every deleted one (aocDeleteMessage), and counts the unread uplinks for the COMPANY
 * MSG memo. Displaying a message on the OIT sends aocMessageRead back to the AOC, which marks it read.
 *
 * A new unread uplink is announced to the message toolbars of the OIT (onNewUplink); once it is read or deleted, on
 * either OIT, its notification goes (onUplinkHandled).
 */

export interface CompanyComInboxEntry {
  /** The AOC message id */
  uid: number;
  /** The subject line: message type and sender */
  subject: string;
  /** The sender (ground station or callsign) */
  from: string;
  text: string;
  /** The reception time, ms since the epoch (UTC), null when unknown */
  receivedAt: number | null;
  /** The flight crew has displayed the message (the AOC message Confirmed flag) */
  read: boolean;
}

/** The subject line shown in the inbox for each AOC message type */
const SUBJECT_BY_TYPE: Partial<Record<AtsuMessageType, string>> = {
  [AtsuMessageType.Freetext]: 'FREE TEXT',
  [AtsuMessageType.METAR]: 'METAR',
  [AtsuMessageType.TAF]: 'TAF',
  [AtsuMessageType.ATIS]: 'ATIS',
};

/**
 * The UTC time of an AOC timestamp.
 * @param timestamp the AOC timestamp (UTC date and seconds of the day; month 1 to 12)
 * @returns ms since the epoch, or null when the timestamp is not set
 */
export function atsuTimestampToUtcMs(timestamp: AtsuTimestamp | null | undefined): number | null {
  if (!timestamp || !timestamp.Year) {
    return null;
  }
  return Date.UTC(timestamp.Year, timestamp.Month - 1, timestamp.Day) + timestamp.Seconds * 1000;
}

/**
 * The inbox entry of an AOC message.
 * @param message the AOC message (deserialized, with its serialize method)
 * @returns the inbox entry, or null for a downlink message (it is not in the inbox)
 */
export function inboxEntryOf(message: AtsuMessage | null): CompanyComInboxEntry | null {
  if (message === null || message.Direction !== AtsuMessageDirection.Uplink) {
    return null;
  }

  const from = message.Station ?? '';
  const type = SUBJECT_BY_TYPE[message.Type] ?? 'MESSAGE';
  let text: string;
  try {
    text = message.serialize(AtsuMessageSerializationFormat.Mailbox);
  } catch (_e) {
    // a message type without a mailbox format
    text = message.Message ?? '';
  }

  return {
    uid: message.UniqueMessageID,
    subject: from ? `${type} ${from}` : type,
    from,
    text,
    receivedAt: atsuTimestampToUtcMs(message.Timestamp),
    read: message.Confirmed === true,
  };
}

/**
 * Puts a new or changed message into the inbox.
 * @param entries the inbox, newest first
 * @param entry the message
 * @returns the new inbox: a known message is replaced in place, a new one goes on top
 */
export function upsertInboxEntry(
  entries: readonly CompanyComInboxEntry[],
  entry: CompanyComInboxEntry,
): CompanyComInboxEntry[] {
  const index = entries.findIndex((e) => e.uid === entry.uid);
  if (index === -1) {
    return [entry, ...entries];
  }
  const updated = entries.slice();
  updated[index] = entry;
  return updated;
}

/**
 * The printed text of an inbox message: its subject, sender and reception time, then the message.
 * @param entry the message
 * @param formatDateTime the date and time format of the OIT (AnsuOps.formatDateTime)
 * @returns the text, one line per printed line (the printer wraps the long lines)
 */
export function aocPrintText(entry: CompanyComInboxEntry, formatDateTime: (utcMs: number) => string): string {
  const header = [`SUBJECT : ${entry.subject}`, `FROM : ${entry.from || '<unknown>'}`];
  if (entry.receivedAt !== null) {
    header.push(`RECEIVED : ${formatDateTime(entry.receivedAt)}`);
  }
  return [...header, '', entry.text].join('\n');
}

/** The OIT COMPANY COM inbox, fed by the AOC */
export class CompanyComMailbox {
  private readonly subscriptions: Subscription[] = [];

  /** The inbox, newest first */
  public readonly messages = ArraySubject.create<CompanyComInboxEntry>([]);

  private readonly _unreadCount = Subject.create(0);
  /** The messages the flight crew has not displayed yet, the count of the Inbox folder */
  public readonly unreadCount = this._unreadCount as Subscribable<number>;

  private readonly _displayedUid = Subject.create<number | null>(null);
  /** The message the Inbox displays, kept while the crew looks at other pages */
  public readonly displayedUid = this._displayedUid as Subscribable<number | null>;

  private readonly newUplinkHandlers: ((entry: CompanyComInboxEntry) => void)[] = [];

  private readonly uplinkHandledHandlers: ((uid: number) => void)[] = [];

  constructor(private readonly bus: EventBus) {
    this.messages.sub(() => this._unreadCount.set(this.messages.getArray().filter((m) => !m.read).length));
  }

  /**
   * @param handler called with each new unread uplink message
   */
  public onNewUplink(handler: (entry: CompanyComInboxEntry) => void): void {
    this.newUplinkHandlers.push(handler);
  }

  /**
   * @param handler called with the AOC id of an unread message that was read or deleted
   */
  public onUplinkHandled(handler: (uid: number) => void): void {
    this.uplinkHandledHandlers.push(handler);
  }

  /**
   * The Inbox displays a message, which marks it read
   * @param uid the AOC message id
   */
  public display(uid: number): void {
    this._displayedUid.set(uid);
    this.markRead(uid);
  }

  /** Starts listening to the AOC */
  public init(): void {
    const sub = this.bus.getSubscriber<AocFmsMessages>();
    this.subscriptions.push(
      sub.on('aocResynchronizeFreetextMessage').handle((data) => this.onMessage(data)),
      sub.on('aocResynchronizeWeatherMessage').handle((data) => this.onMessage(data)),
      sub.on('aocDeleteMessage').handle((uid) => this.onDeleted(uid)),
      sub.on('aocResetData').handle(() => this.onReset()),
    );
  }

  /**
   * Marks a message read once the flight crew displays it, so that the AOC removes it from the COMPANY MSG count.
   * @param uid the AOC message id
   */
  public markRead(uid: number): void {
    const entries = this.messages.getArray();
    const index = entries.findIndex((e) => e.uid === uid);
    if (index === -1 || entries[index].read) {
      return;
    }
    this.messages.set(upsertInboxEntry(entries, { ...entries[index], read: true }));
    this.notifyUplinkHandled(uid);
    // To the AOC in the systems host (another instrument): synced
    this.bus.getPublisher<FmsAocMessages>().pub('aocMessageRead', uid, true, false);
  }

  /**
   * PRINT of a message: any message can be printed by hand. The AOC prints on the pedestal printer: the aocPrintMessage
   * text goes to the FMS printer of the MFD (MFD/FMC/AocPrintClient.ts), synced as it is another instrument.
   * @param uid the AOC message id
   * @param formatDateTime the date and time format of the OIT
   * @returns whether the message was sent to the printer (false for an unknown message)
   */
  public printMessage(uid: number, formatDateTime: (utcMs: number) => string): boolean {
    const entry = this.messages.getArray().find((e) => e.uid === uid);
    if (!entry) {
      return false;
    }
    this.bus.getPublisher<AocFmsMessages>().pub('aocPrintMessage', aocPrintText(entry, formatDateTime), true, false);
    return true;
  }

  public destroy(): void {
    this.subscriptions.forEach((s) => s.destroy());
    this.subscriptions.length = 0;
  }

  private onMessage(data: AtsuMessage): void {
    const entry = inboxEntryOf(Conversion.messageDataToMessage(data));
    if (entry === null) {
      return;
    }
    const known = this.messages.getArray().find((e) => e.uid === entry.uid);
    this.messages.set(upsertInboxEntry(this.messages.getArray(), entry));
    if (known === undefined && !entry.read) {
      this.newUplinkHandlers.forEach((handler) => handler(entry));
    } else if (known !== undefined && !known.read && entry.read) {
      // read on the other OIT (or the MCDU)
      this.notifyUplinkHandled(entry.uid);
    }
  }

  private onDeleted(uid: number): void {
    const entries = this.messages.getArray();
    const deleted = entries.find((e) => e.uid === uid);
    if (deleted === undefined) {
      return;
    }
    this.messages.set(entries.filter((e) => e.uid !== uid));
    if (this._displayedUid.get() === uid) {
      this._displayedUid.set(null);
    }
    if (!deleted.read) {
      this.notifyUplinkHandled(uid);
    }
  }

  /** The AOC deletes the whole mailbox at the end of each flight */
  private onReset(): void {
    const unread = this.messages
      .getArray()
      .filter((e) => !e.read)
      .map((e) => e.uid);
    this.messages.clear();
    this._displayedUid.set(null);
    unread.forEach((uid) => this.notifyUplinkHandled(uid));
  }

  private notifyUplinkHandled(uid: number): void {
    this.uplinkHandledHandlers.forEach((handler) => handler(uid));
  }
}
