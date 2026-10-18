// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AocFmsMessages } from '@datalink/aoc';
import { EventBus, Subject, Subscribable, Subscription } from '@microsoft/msfs-sdk';

/*
 * The COMPANY COM Outbox and Sent folders of the OIT (AOC application): the downlinks sent from this OIT. The AOC
 * stores the messages in the sent, inbox and outbox folders, and deletes the whole mailbox at the end of each flight. A
 * request shows in Sent once the ground acknowledges it; until then it waits in the Outbox.
 *
 * How an OIT form uses it (the weather request and free text do, through CompanyComRequests):
 * 1. recordDownlink() when the crew sends it: the message goes into the Outbox as SENDING.
 * 2. markSent() when the AOC reports it acknowledged by the ground: it moves to Sent.
 * 3. markNotSent() when the AOC reports a failure or does not answer: it stays in the Outbox as NOT SENT. A message
 *    already acknowledged stays in Sent.
 */

export enum CompanyComDownlinkStatus {
  Sending = 'SENDING',
  NotSent = 'NOT SENT',
  Sent = 'SENT',
}

export interface CompanyComDownlinkDraft {
  /** The subject line, e.g. FREE TEXT */
  readonly subject: string;
  /** The station it goes to, empty for the company ground station */
  readonly to: string;
  readonly text: string;
}

export interface CompanyComDownlink extends CompanyComDownlinkDraft {
  readonly id: number;
  /** When the crew sent it, ms since the epoch (UTC), null when unknown */
  readonly createdAt: number | null;
  /** When the ground acknowledged it, null before */
  readonly sentAt: number | null;
  readonly status: CompanyComDownlinkStatus;
}

/**
 * @param downlink the downlink
 * @returns the station it goes to (Design choice: a message without a station goes to the company ground station)
 */
export function downlinkRecipient(downlink: CompanyComDownlink): string {
  return downlink.to || 'COMPANY';
}

/**
 * The printed text of a downlink: its subject, recipient and time, then the message.
 * @param downlink the downlink
 * @param formatDateTime the date and time format of the OIT (AnsuOps.formatDateTime)
 * @returns the text, one line per printed line
 */
export function downlinkPrintText(downlink: CompanyComDownlink, formatDateTime: (utcMs: number) => string): string {
  const header = [`SUBJECT : ${downlink.subject}`, `TO : ${downlinkRecipient(downlink)}`];
  const time = downlink.sentAt ?? downlink.createdAt;
  if (time !== null) {
    header.push(`${downlink.sentAt !== null ? 'SENT' : 'CREATED'} : ${formatDateTime(time)}`);
  }
  header.push(`STATUS : ${downlink.status}`);
  return [...header, '', downlink.text].join('\n');
}

/** The downlinks of one OIT, for its Outbox and Sent folders */
export class CompanyComDownlinks {
  private readonly subscriptions: Subscription[] = [];

  private nextId = 1;

  private readonly _downlinks = Subject.create<readonly CompanyComDownlink[]>([]);
  /** Every downlink, newest first */
  public readonly downlinks = this._downlinks as Subscribable<readonly CompanyComDownlink[]>;

  /** The downlinks not acknowledged by the ground yet (sending or not sent), newest first */
  public readonly outbox: Subscribable<readonly CompanyComDownlink[]> = this._downlinks.map((downlinks) =>
    downlinks.filter((d) => d.status !== CompanyComDownlinkStatus.Sent),
  );

  /** The downlinks acknowledged by the ground, newest first */
  public readonly sent: Subscribable<readonly CompanyComDownlink[]> = this._downlinks.map((downlinks) =>
    downlinks.filter((d) => d.status === CompanyComDownlinkStatus.Sent),
  );

  /**
   * @param bus the bus of the OIT
   * @param now the UTC time, ms since the epoch
   */
  constructor(
    private readonly bus: EventBus,
    private readonly now: () => number | null,
  ) {}

  /** Starts listening to the AOC, which deletes the whole mailbox at the end of each flight */
  public init(): void {
    this.subscriptions.push(
      this.bus
        .getSubscriber<AocFmsMessages>()
        .on('aocResetData')
        .handle(() => this._downlinks.set([])),
    );
  }

  /**
   * The crew sends a message: it goes into the Outbox
   * @param draft the message
   * @returns its id, for markSent and markNotSent
   */
  public recordDownlink(draft: CompanyComDownlinkDraft): number {
    const id = this.nextId++;
    const downlink: CompanyComDownlink = {
      id,
      subject: draft.subject,
      to: draft.to,
      text: draft.text,
      createdAt: this.now(),
      sentAt: null,
      status: CompanyComDownlinkStatus.Sending,
    };
    this._downlinks.set([downlink, ...this._downlinks.get()]);
    return id;
  }

  /**
   * The ground acknowledged the message: it moves to Sent
   * @param id the downlink id
   */
  public markSent(id: number): void {
    this.update(id, (d) =>
      d.status === CompanyComDownlinkStatus.Sent
        ? d
        : { ...d, status: CompanyComDownlinkStatus.Sent, sentAt: this.now() },
    );
  }

  /**
   * The message could not be sent: it stays in the Outbox, NOT SENT (an acknowledged message stays in Sent)
   * @param id the downlink id
   */
  public markNotSent(id: number): void {
    this.update(id, (d) =>
      d.status === CompanyComDownlinkStatus.Sending ? { ...d, status: CompanyComDownlinkStatus.NotSent } : d,
    );
  }

  /**
   * PRINT of a downlink, on the pedestal printer as the inbox messages (aocPrintMessage)
   * @param id the downlink id
   * @param formatDateTime the date and time format of the OIT
   * @returns whether it was sent to the printer (false for an unknown downlink)
   */
  public printDownlink(id: number, formatDateTime: (utcMs: number) => string): boolean {
    const downlink = this._downlinks.get().find((d) => d.id === id);
    if (!downlink) {
      return false;
    }
    this.bus
      .getPublisher<AocFmsMessages>()
      .pub('aocPrintMessage', downlinkPrintText(downlink, formatDateTime), true, false);
    return true;
  }

  public destroy(): void {
    this.subscriptions.forEach((s) => s.destroy());
    this.subscriptions.length = 0;
  }

  private update(id: number, change: (downlink: CompanyComDownlink) => CompanyComDownlink): void {
    const downlinks = this._downlinks.get();
    const index = downlinks.findIndex((d) => d.id === id);
    if (index === -1) {
      return;
    }
    const changed = change(downlinks[index]);
    if (changed !== downlinks[index]) {
      const updated = downlinks.slice();
      updated[index] = changed;
      this._downlinks.set(updated);
    }
  }
}
