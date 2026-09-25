// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, Subject, Subscription } from '@microsoft/msfs-sdk';
import { CompanyTakeoffDataEvents, CompanyTakeoffDataRequest, CompanyTakeoffDataUplink } from '@flybywiresim/fbw-sdk';

/** The takeoff data request as the FMS sends it, without the flypad request id */
export type CompanyTakeoffDataRequestContent = Omit<CompanyTakeoffDataRequest, 'answersRequestId'>;

export enum CompanyTakeoffDataMessage {
  Received,
  NotValid,
  NoReply,
}

/**
 * The company takeoff data of the FMS (A380 FCOM DSC-22-FMS, company takeoff data): the request sent with SEND T.O
 * REQUEST, and the takeoff data received with or without a request, kept until the flight crew inserts or clears it.
 * The company ground station is the flypad takeoff calculator.
 */
export class CompanyTakeoffData {
  /** FCOM: the received takeoff data covers up to four runways */
  public static readonly MAX_RUNWAYS = 4;

  /** FCOM: NO COMPANY REPLY when no response is received within 4 min after the request */
  private static readonly REPLY_TIMEOUT_MS = 4 * 60_000;

  /** A request is waiting for its answer (the SEND T.O REQUEST button shows REQUEST PENDING...) */
  public readonly requestPending = Subject.create(false);

  /** The received takeoff data, oldest first: up to four runways, one uplink per runway and thrust rating */
  public readonly uplinks = Subject.create<readonly CompanyTakeoffDataUplink[]>([]);

  private replyTimeout: ReturnType<typeof setTimeout> | null = null;

  private readonly subs: Subscription[] = [];

  /**
   * @param bus the event bus
   * @param answerFlypadRequests whether this FMC answers the takeoff data import requests of the flypad (only one does)
   * @param fmsData the current takeoff data of the FMS, for the flypad import requests
   * @param onMessage shows an FMS message
   */
  constructor(
    private readonly bus: EventBus,
    answerFlypadRequests: boolean,
    private readonly fmsData: () => CompanyTakeoffDataRequestContent,
    private readonly onMessage: (message: CompanyTakeoffDataMessage) => void,
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

  /** SEND T.O REQUEST: sends the request to the company, if no other one is pending */
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
      this.onMessage(CompanyTakeoffDataMessage.NoReply);
    }, CompanyTakeoffData.REPLY_TIMEOUT_MS);
    return true;
  }

  /** CLEAR: removes received takeoff data */
  public clear(uplink: CompanyTakeoffDataUplink): void {
    this.uplinks.set(this.uplinks.get().filter((u) => u !== uplink));
  }

  public destroy(): void {
    if (this.replyTimeout !== null) {
      clearTimeout(this.replyTimeout);
    }
    this.subs.forEach((s) => s.destroy());
  }

  private onUplink(uplink: CompanyTakeoffDataUplink): void {
    if (!CompanyTakeoffData.isValid(uplink)) {
      this.onMessage(CompanyTakeoffDataMessage.NotValid);
      return;
    }
    if (this.replyTimeout !== null) {
      clearTimeout(this.replyTimeout);
      this.replyTimeout = null;
    }
    this.requestPending.set(false);

    // The same runway and thrust rating replace the older data; beyond four runways, the oldest runway goes
    let list = this.uplinks.get().filter((u) => !(u.runway === uplink.runway && u.thrust === uplink.thrust));
    list = [...list, uplink];
    const runways = [...new Set(list.map((u) => u.runway))];
    if (runways.length > CompanyTakeoffData.MAX_RUNWAYS) {
      list = list.filter((u) => u.runway !== runways[0]);
    }
    this.uplinks.set(list);
    this.onMessage(CompanyTakeoffDataMessage.Received);
  }

  private static isValid(uplink: CompanyTakeoffDataUplink): boolean {
    const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
    return (
      typeof uplink?.departure === 'string' &&
      uplink.departure.length === 4 &&
      typeof uplink.runway === 'string' &&
      uplink.runway.length > 0 &&
      [
        uplink.tow,
        uplink.qnh,
        uplink.windDirection,
        uplink.windSpeed,
        uplink.runwayCondition,
        uplink.oat,
        uplink.v2,
      ].every(finite) &&
      (uplink.v1 === null || finite(uplink.v1)) &&
      (uplink.vr === null || finite(uplink.vr)) &&
      [1, 2, 3].includes(uplink.flaps) &&
      (uplink.thrust === 'TOGA' || (uplink.thrust === 'FLEX' && finite(uplink.flexTemperature)))
    );
  }
}
