// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject, Subscribable } from '@microsoft/msfs-sdk';

/*
 * The message toolbar of an OIS menu bar (NSS AVNCS and FLT OPS side each have one): it displays messages to the flight
 * crew, counts them ("0 MSG"), lists them under its arrow, and CLEAR erases them.
 *
 * The AOC tells the crew that a company message is received with a notification. On the FLT OPS side the notification
 * is pushed through the NSS AVNCS, and selecting it on one OIT does not delete it on the other OIT: each OIT keeps its
 * own toolbars.
 *
 * Design choices:
 * - The counter counts every message on the toolbar; the toolbar shows the newest one, the list has all, newest first.
 * - Selecting a message in the list takes it off the toolbar (the NSS AVNCS side then displays the company message).
 * - A notification also goes when its company message is read or deleted, on either OIT: it has nothing left to say.
 */

export interface OisToolbarMessage {
  readonly id: number;
  readonly text: string;
  /** The AOC message id of a company message notification, null for another message */
  readonly aocUid: number | null;
}

/**
 * @param subject the subject line of the received company message
 * @returns the text of its notification (Design choice: the COMPANY MSG memo wording, then the message subject)
 */
export function aocNotificationText(subject: string): string {
  return `COMPANY MSG : ${subject}`;
}

export class OisMessageToolbar {
  private nextId = 1;

  private readonly _messages = Subject.create<readonly OisToolbarMessage[]>([]);
  /** The messages, newest first */
  public readonly messages = this._messages as Subscribable<readonly OisToolbarMessage[]>;

  /** The counter of the toolbar */
  public readonly count: Subscribable<number> = this._messages.map((messages) => messages.length);

  /** The message the toolbar shows: the newest one, empty without a message */
  public readonly shownText: Subscribable<string> = this._messages.map((messages) =>
    messages.length > 0 ? messages[0].text : '',
  );

  /**
   * Puts a message on the toolbar
   * @param text the message
   * @param aocUid the AOC message id of a company message notification
   * @returns the toolbar message id, null when the company message already has a notification
   */
  public post(text: string, aocUid: number | null = null): number | null {
    if (aocUid !== null && this._messages.get().some((m) => m.aocUid === aocUid)) {
      return null;
    }
    const id = this.nextId++;
    this._messages.set([{ id, text, aocUid }, ...this._messages.get()]);
    return id;
  }

  /**
   * Notification of a received company message
   * @param aocUid the AOC message id
   * @param subject its subject line
   * @returns the toolbar message id, null when the message already has a notification
   */
  public postAocNotification(aocUid: number, subject: string): number | null {
    return this.post(aocNotificationText(subject), aocUid);
  }

  /**
   * The flight crew selects a message in the list: it leaves the toolbar
   * @param id the toolbar message id
   * @returns the message, null when it is no longer on the toolbar
   */
  public select(id: number): OisToolbarMessage | null {
    const message = this._messages.get().find((m) => m.id === id) ?? null;
    if (message !== null) {
      this._messages.set(this._messages.get().filter((m) => m.id !== id));
    }
    return message;
  }

  /**
   * The company message was read or deleted: its notification goes
   * @param aocUid the AOC message id
   */
  public removeAocNotification(aocUid: number): void {
    if (this._messages.get().some((m) => m.aocUid === aocUid)) {
      this._messages.set(this._messages.get().filter((m) => m.aocUid !== aocUid));
    }
  }

  /** CLEAR: erases every message */
  public clear(): void {
    if (this._messages.get().length > 0) {
      this._messages.set([]);
    }
  }
}
