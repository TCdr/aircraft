// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject, Subscribable } from '@microsoft/msfs-sdk';

/*
 * The System Message Area of the MFD header: draws the attention of the flight crew to an FMS or ATC COM event while
 * the MFD shows another application:
 * - NEW ATIS RECEIVED: a new ATIS report is received; removed when the crew opens an ATC COM page.
 * - ATIS SYS MSG: an ATIS flight system message (FSM) is received; removed when the crew opens an ATC COM page.
 * - CHECK FMS MESSAGE: an amber FMS message is pending; removed when the crew opens an FMS page.
 */

/** An application of the MFD system selector, as the MFD URIs name it (MfdSystem): fms, atccom, surv, fcubkup */
export type MfdApplication = string;

export const NEW_ATIS_RECEIVED = 'NEW ATIS RECEIVED';
export const ATIS_SYS_MSG = 'ATIS SYS MSG';
export const CHECK_FMS_MESSAGE = 'CHECK FMS MESSAGE';

type SystemAreaMessage = typeof NEW_ATIS_RECEIVED | typeof ATIS_SYS_MSG | typeof CHECK_FMS_MESSAGE;

/** The application whose access removes a message */
const OWNER: Record<SystemAreaMessage, MfdApplication> = {
  [NEW_ATIS_RECEIVED]: 'atccom',
  [ATIS_SYS_MSG]: 'atccom',
  [CHECK_FMS_MESSAGE]: 'fms',
};

/**
 * The Message Status / FSM button indications that come from an ATIS Flight System Message of the ATC center: USE
 * VOICE, SEND AGAIN, NO AUTO UPDATE, END OF UPDATE. SENDING and SENT are the aircraft's own request states.
 */
const ATIS_FSM_STATUSES: readonly string[] = ['USE VOICE', 'SEND AGAIN', 'NO AUTO UPDATE', 'END OF UPDATE'];

/**
 * The System Message Area of one MFD. Design choices: the area shows one message, the most recent one of those raised
 * (the real priority is not documented); a message is raised only by a new event, so going back to another application
 * does not bring back a message whose event the crew has seen in its application.
 */
export class MfdSystemMessageArea {
  private application: MfdApplication = 'fms';

  /** The raised messages, oldest first */
  private readonly raised: SystemAreaMessage[] = [];

  private readonly shownText = Subject.create('');

  /** The ATIS version of each request area that last raised NEW ATIS RECEIVED */
  private readonly raisedAtisVersions: (string | null)[] = [];

  /** The Message Status / FSM button indication of each request area at the last update */
  private readonly atisStatuses: string[] = [];

  /** The text of the System Message Area, '' when empty */
  public get text(): Subscribable<string> {
    return this.shownText;
  }

  /**
   * The MFD shows a page of an application: the messages of that application are removed
   * @param application the application of the page shown
   */
  public onApplicationShown(application: MfdApplication): void {
    this.application = application;
    this.remove((message) => OWNER[message] === application);
  }

  /**
   * The FMS message queue changed
   * @param newAmberMessage an amber FMS message was just added to the queue
   * @param amberMessagePending an amber FMS message is pending (in the queue and not cleared)
   */
  public onFmsMessages(newAmberMessage: boolean, amberMessagePending: boolean): void {
    if (!amberMessagePending) {
      // nothing to check any more on the FMS pages
      this.remove((message) => message === CHECK_FMS_MESSAGE);
    } else if (newAmberMessage) {
      this.raise(CHECK_FMS_MESSAGE);
    }
  }

  /**
   * The ATIS reports or the ATIS request areas changed
   * @param unreadVersions for each ATIS request area, the version (ATIS letter) of its last report when the crew has
   * not read it yet, else null
   * @param statuses for each ATIS request area, the Message Status / FSM button indication
   */
  public onAtis(unreadVersions: readonly (string | null)[], statuses: readonly string[]): void {
    unreadVersions.forEach((version, index) => {
      if (version !== null && version !== (this.raisedAtisVersions[index] ?? null)) {
        this.raise(NEW_ATIS_RECEIVED);
      }
      this.raisedAtisVersions[index] = version;
    });
    statuses.forEach((status, index) => {
      if (ATIS_FSM_STATUSES.includes(status) && status !== this.atisStatuses[index]) {
        this.raise(ATIS_SYS_MSG);
      }
      this.atisStatuses[index] = status;
    });
  }

  private raise(message: SystemAreaMessage): void {
    // Only while the MFD does not show the application of the event
    if (OWNER[message] === this.application) {
      return;
    }
    this.remove((m) => m === message);
    this.raised.push(message);
    this.update();
  }

  private remove(predicate: (message: SystemAreaMessage) => boolean): void {
    for (let i = this.raised.length - 1; i >= 0; i--) {
      if (predicate(this.raised[i])) {
        this.raised.splice(i, 1);
      }
    }
    this.update();
  }

  private update(): void {
    this.shownText.set(this.raised.length > 0 ? this.raised[this.raised.length - 1] : '');
  }
}
