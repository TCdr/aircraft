// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AocFmsMessages, FmsAocMessages } from '@datalink/aoc';
import { AtsuStatusCodes, FreetextMessage } from '@datalink/common';
import { EventBus, Subject, Subscribable, Subscription } from '@microsoft/msfs-sdk';
import { CompanyComDownlinks } from './CompanyComDownlinks';
import { COMPANY_COM_REQUEST_TIMEOUT_MS, CompanyComRequestStatus } from './CompanyComRequests';

/*
 * Sends the COMPANY COM report and request forms of one OIT (CompanyComReportForms) through the AOC, as free texts on
 * the Hoppie network: each one goes into the Outbox, then into Sent once the AOC reports it transmitted. Each form has
 * its own status; one message per form at a time.
 */

interface PendingReport {
  readonly formUrl: string;
  readonly downlinkId: number;
  readonly timeout: ReturnType<typeof setTimeout>;
}

/** The report forms of one OIT: sends them and follows their answers */
export class CompanyComReports {
  private readonly subscriptions: Subscription[] = [];

  /**
   * The id of the next message. The AOC answers by request id to every client on the bus (both OITs, the FMS, the
   * weather request and free text of CompanyComRequests): these ids start far from all of them.
   */
  private nextRequestId = 20_000_000 + Math.floor(Math.random() * 10_000) * 1_000;

  private readonly pending = new Map<number, PendingReport>();

  private readonly statuses = new Map<string, Subject<CompanyComRequestStatus>>();

  /** Design choice: a new form starts with the station of the last report sent from this OIT */
  public readonly lastStation = Subject.create<string | null>(null);

  /**
   * @param bus the bus of the OIT
   * @param downlinks the Outbox and Sent folders the reports go into
   */
  constructor(
    private readonly bus: EventBus,
    private readonly downlinks: CompanyComDownlinks,
  ) {}

  public init(): void {
    this.subscriptions.push(
      this.bus
        .getSubscriber<AocFmsMessages>()
        .on('aocTransmissionResponse')
        .handle((response) => {
          if (this.pending.has(response.requestId)) {
            this.end(
              response.requestId,
              response.status === AtsuStatusCodes.Ok ? CompanyComRequestStatus.Sent : CompanyComRequestStatus.Failed,
            );
          }
        }),
    );
  }

  /**
   * @param formUrl the page URL of the form
   * @returns the state of the last message of that form, shown under its SEND button
   */
  public status(formUrl: string): Subscribable<CompanyComRequestStatus> {
    return this.statusSubject(formUrl);
  }

  /**
   * Sends a report through the AOC
   * @param formUrl the page URL of the form
   * @param subject the subject in Outbox and Sent (the title of the form)
   * @param message the free text (checkReport), null when the form is not complete
   * @returns false without a message or while the last message of this form is being sent
   */
  public send(formUrl: string, subject: string, message: FreetextMessage | null): boolean {
    if (message === null || this.statusSubject(formUrl).get() === CompanyComRequestStatus.Sending) {
      return false;
    }
    const requestId = this.nextRequestId++;
    const downlinkId = this.downlinks.recordDownlink({ subject, to: message.Station, text: message.Message });
    const timeout = setTimeout(
      () => this.end(requestId, CompanyComRequestStatus.Failed),
      COMPANY_COM_REQUEST_TIMEOUT_MS,
    );
    this.pending.set(requestId, { formUrl, downlinkId, timeout });
    this.lastStation.set(message.Station);
    this.statusSubject(formUrl).set(CompanyComRequestStatus.Sending);
    this.bus.getPublisher<FmsAocMessages>().pub('aocSendFreetextMessage', { message, requestId }, true, false);
    return true;
  }

  public destroy(): void {
    this.subscriptions.forEach((subscription) => subscription.destroy());
    this.subscriptions.length = 0;
    this.pending.forEach((report) => clearTimeout(report.timeout));
    this.pending.clear();
  }

  private statusSubject(formUrl: string): Subject<CompanyComRequestStatus> {
    let status = this.statuses.get(formUrl);
    if (!status) {
      status = Subject.create<CompanyComRequestStatus>(CompanyComRequestStatus.None);
      this.statuses.set(formUrl, status);
    }
    return status;
  }

  /**
   * A failed message stays in the Outbox as NOT SENT; a transmitted one moves to Sent
   * @param requestId the request id of the message
   * @param status how it ended
   */
  private end(requestId: number, status: CompanyComRequestStatus): void {
    const report = this.pending.get(requestId);
    if (!report) {
      return;
    }
    clearTimeout(report.timeout);
    this.pending.delete(requestId);
    if (status === CompanyComRequestStatus.Sent) {
      this.downlinks.markSent(report.downlinkId);
    } else {
      this.downlinks.markNotSent(report.downlinkId);
    }
    this.statusSubject(report.formUrl).set(status);
  }
}
