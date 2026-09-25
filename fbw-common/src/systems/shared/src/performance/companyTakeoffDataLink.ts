//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { EventBus, Subject, Subscription } from '@microsoft/msfs-sdk';

import { CompanyTakeoffDataEvents, CompanyTakeoffDataRequest, CompanyTakeoffDataUplink } from './companyTakeoffData';

/** The takeoff data request as the FMS sends it, without the flypad request id */
export type CompanyTakeoffDataRequestContent = Omit<CompanyTakeoffDataRequest, 'answersRequestId'>;

/** The events of the takeoff data link that the FMS shows as a message */
export enum CompanyTakeoffDataLinkMessage {
  /** Takeoff data received (A380 CPNY T.O DATA RECEIVED, A320 TAKEOFF DATA UPLINK) */
  Received,
  /** Takeoff data received but not valid (A380 RECEIVED CPNY T.O DATA NOT VALID, A320 INVALID TAKEOFF UPLINK) */
  Invalid,
  /** No answer to the request after 4 minutes (A380 NO COMPANY REPLY, A320 NO ANSWER TO REQUEST) */
  NoReply,
}

/**
 * The takeoff data link of an FMS with the ground station, which is the flypad takeoff calculator: the request, sent
 * for up to two runways, and the takeoff data received with or without a request, for up to four runways, kept until
 * the flight crew inserts or clears it (A380 FCOM DSC-22-FMS company takeoff data, A320 FCOM DSC-22_45 TAKEOFF DATA
 * FUNCTION). The aircraft classes add their own validation of the received data.
 */
export abstract class CompanyTakeoffDataLink {
  /** FCOM: the received takeoff data covers up to four runways */
  public static readonly MAX_RUNWAYS = 4;

  /** FCOM: the FMS message when no answer is received within 4 min after the request */
  private static readonly REPLY_TIMEOUT_MS = 4 * 60_000;

  /** A request is waiting for its answer */
  public readonly requestPending = Subject.create(false);

  /** The received takeoff data, oldest first: one uplink per runway and thrust rating */
  public readonly uplinks = Subject.create<readonly CompanyTakeoffDataUplink[]>([]);

  private replyTimeout: ReturnType<typeof setTimeout> | null = null;

  private readonly subs: Subscription[] = [];

  /**
   * @param bus the event bus
   * @param answerFlypadRequests whether this FMS answers the takeoff data import requests of the flypad (only one does)
   * @param fmsData the current takeoff data of the FMS, for the flypad import requests
   * @param onMessage shows an FMS message
   */
  constructor(
    private readonly bus: EventBus,
    answerFlypadRequests: boolean,
    private readonly fmsData: () => CompanyTakeoffDataRequestContent,
    private readonly onMessage: (message: CompanyTakeoffDataLinkMessage) => void,
  ) {
    const sub = this.bus.getSubscriber<CompanyTakeoffDataEvents>();
    this.subs.push(sub.on('cpny_to_uplink').handle((uplink) => this.onUplink(uplink)));
    if (answerFlypadRequests) {
      this.subs.push(
        sub
          .on('cpny_to_fms_data_request')
          .handle((requestId) =>
            this.bus
              .getPublisher<CompanyTakeoffDataEvents>()
              .pub('cpny_to_fms_data', { ...this.fmsData(), answersRequestId: requestId }, true, false),
          ),
      );
    }
  }

  /** Sends the request to the ground station, if no other one is pending */
  public sendRequest(request: CompanyTakeoffDataRequestContent): boolean {
    if (this.requestPending.get()) {
      return false;
    }
    this.bus
      .getPublisher<CompanyTakeoffDataEvents>()
      .pub('cpny_to_fms_data', { ...request, answersRequestId: null }, true, false);
    this.requestPending.set(true);
    this.replyTimeout = setTimeout(() => {
      this.replyTimeout = null;
      this.requestPending.set(false);
      this.onMessage(CompanyTakeoffDataLinkMessage.NoReply);
    }, CompanyTakeoffDataLink.REPLY_TIMEOUT_MS);
    return true;
  }

  /** The runways of the received data, in reception order */
  public runways(): string[] {
    return [...new Set(this.uplinks.get().map((u) => u.runway))];
  }

  /** The received data of a runway and thrust rating */
  public find(runway: string, flex: boolean): CompanyTakeoffDataUplink | undefined {
    return this.uplinks.get().find((u) => u.runway === runway && (u.thrust === 'FLEX') === flex);
  }

  /** Removes received takeoff data, inserted or cleared by the flight crew */
  public remove(uplink: CompanyTakeoffDataUplink): void {
    this.uplinks.set(this.uplinks.get().filter((u) => u !== uplink));
  }

  public destroy(): void {
    if (this.replyTimeout !== null) {
      clearTimeout(this.replyTimeout);
    }
    this.subs.forEach((s) => s.destroy());
  }

  /** The checks common to both aircraft; the aircraft classes add theirs */
  protected isValid(uplink: CompanyTakeoffDataUplink): boolean {
    const finite = CompanyTakeoffDataLink.isFiniteNumber;
    return (
      typeof uplink?.departure === 'string' &&
      uplink.departure.length === 4 &&
      typeof uplink.runway === 'string' &&
      uplink.runway.length > 0 &&
      [uplink.tow, uplink.qnh, uplink.windDirection, uplink.windSpeed, uplink.oat, uplink.v2].every(finite) &&
      [1, 2, 3].includes(uplink.flaps) &&
      (uplink.thrust === 'TOGA' || (uplink.thrust === 'FLEX' && finite(uplink.flexTemperature)))
    );
  }

  protected static isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private onUplink(uplink: CompanyTakeoffDataUplink): void {
    if (!this.isValid(uplink)) {
      this.onMessage(CompanyTakeoffDataLinkMessage.Invalid);
      return;
    }
    if (this.replyTimeout !== null) {
      clearTimeout(this.replyTimeout);
      this.replyTimeout = null;
    }
    this.requestPending.set(false);

    // FCOM: the same runway and thrust rating replace the older data; beyond four runways, the oldest runway goes
    let list = this.uplinks.get().filter((u) => !(u.runway === uplink.runway && u.thrust === uplink.thrust));
    list = [...list, uplink];
    const runways = [...new Set(list.map((u) => u.runway))];
    if (runways.length > CompanyTakeoffDataLink.MAX_RUNWAYS) {
      list = list.filter((u) => u.runway !== runways[0]);
    }
    this.uplinks.set(list);
    this.onMessage(CompanyTakeoffDataLinkMessage.Received);
  }
}
