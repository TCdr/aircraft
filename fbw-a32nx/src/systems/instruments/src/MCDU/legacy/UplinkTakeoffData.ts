// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, Subject, Subscription } from '@microsoft/msfs-sdk';
import { CompanyTakeoffDataEvents, CompanyTakeoffDataRequest, CompanyTakeoffDataUplink } from '@flybywiresim/fbw-sdk';

/** The takeoff data request as the FMS sends it, without the flypad request id */
export type UplinkTakeoffDataRequestContent = Omit<CompanyTakeoffDataRequest, 'answersRequestId'>;

export enum UplinkTakeoffDataMessage {
  /** TAKEOFF DATA UPLINK */
  Received,
  /** INVALID TAKEOFF UPLINK */
  Invalid,
  /** NO ANSWER TO REQUEST */
  NoAnswer,
}

/**
 * The uplink takeoff data of the A320 FMS (A320 FCOM DSC-22_45 TAKEOFF DATA FUNCTION, DSC-22_20-50-10-28 UPLINK TO DATA
 * pages): a request for up to two runways, and the takeoff data received for up to four runways, MAX and FLEX for each.
 * The ground station is the flypad takeoff calculator, with the same events as the A380 company takeoff data.
 */
export class UplinkTakeoffData {
  /** FCOM: data received for up to four runways */
  public static readonly MAX_RUNWAYS = 4;

  /** Without an answer to the request, NO ANSWER TO REQUEST */
  private static readonly REPLY_TIMEOUT_MS = 4 * 60_000;

  /** TO DATA REQUEST sent, and no data received since (the asterisk of the prompt disappears) */
  public readonly requestPending = Subject.create(false);

  /** The received takeoff data, oldest first: one per runway and thrust rating */
  public readonly uplinks = Subject.create<readonly CompanyTakeoffDataUplink[]>([]);

  private replyTimeout: ReturnType<typeof setTimeout> | null = null;

  private readonly subs: Subscription[] = [];

  /**
   * @param bus the event bus
   * @param fmsData the current takeoff data of the FMS, for the takeoff data import of the flypad
   * @param onMessage shows an FMS message
   */
  constructor(
    private readonly bus: EventBus,
    private readonly fmsData: () => UplinkTakeoffDataRequestContent,
    private readonly onMessage: (message: UplinkTakeoffDataMessage) => void,
  ) {
    const sub = this.bus.getSubscriber<CompanyTakeoffDataEvents>();
    this.subs.push(
      sub.on('cpny_to_uplink').handle((uplink) => this.onUplink(uplink)),
      sub
        .on('cpny_to_fms_data_request')
        .handle((requestId) =>
          this.bus
            .getPublisher<CompanyTakeoffDataEvents>()
            .pub('cpny_to_fms_data', { ...this.fmsData(), answersRequestId: requestId }, true, false),
        ),
    );
  }

  /** TO DATA REQUEST: sends the request, if no other one is pending */
  public sendRequest(request: UplinkTakeoffDataRequestContent): boolean {
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
      this.onMessage(UplinkTakeoffDataMessage.NoAnswer);
    }, UplinkTakeoffData.REPLY_TIMEOUT_MS);
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

  /** The data is consumed by INSERT UPLINK */
  public remove(uplink: CompanyTakeoffDataUplink): void {
    this.uplinks.set(this.uplinks.get().filter((u) => u !== uplink));
  }

  public destroy(): void {
    if (this.replyTimeout !== null) {
      clearTimeout(this.replyTimeout);
    }
    this.subs.forEach((s) => s.destroy());
  }

  private onUplink(uplink: CompanyTakeoffDataUplink): void {
    if (!UplinkTakeoffData.isValid(uplink)) {
      this.onMessage(UplinkTakeoffDataMessage.Invalid);
      return;
    }
    if (this.replyTimeout !== null) {
      clearTimeout(this.replyTimeout);
      this.replyTimeout = null;
    }
    this.requestPending.set(false);

    // FCOM: previously received data is replaced by the new data (same runway and thrust); four runways at most
    let list = this.uplinks.get().filter((u) => !(u.runway === uplink.runway && u.thrust === uplink.thrust));
    list = [...list, uplink];
    const runways = [...new Set(list.map((u) => u.runway))];
    if (runways.length > UplinkTakeoffData.MAX_RUNWAYS) {
      list = list.filter((u) => u.runway !== runways[0]);
    }
    this.uplinks.set(list);
    this.onMessage(UplinkTakeoffDataMessage.Received);
  }

  private static isValid(uplink: CompanyTakeoffDataUplink): boolean {
    const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
    return (
      typeof uplink?.departure === 'string' &&
      uplink.departure.length === 4 &&
      typeof uplink.runway === 'string' &&
      uplink.runway.length > 0 &&
      [uplink.tow, uplink.qnh, uplink.windDirection, uplink.windSpeed, uplink.oat, uplink.v2].every(finite) &&
      finite(uplink.v1) &&
      finite(uplink.vr) &&
      [1, 2, 3].includes(uplink.flaps) &&
      (uplink.thrust === 'TOGA' || (uplink.thrust === 'FLEX' && finite(uplink.flexTemperature)))
    );
  }
}
