// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AocFmsMessages, FmsAocMessages } from '@datalink/aoc';
import { AtsuMessageNetwork, AtsuStatusCodes, FreetextMessage, WeatherMessage } from '@datalink/common';
import { EventBus, Subject, Subscribable, Subscription } from '@microsoft/msfs-sdk';
import { CompanyComDownlinks } from './CompanyComDownlinks';

/*
 * The weather request and the free text of the COMPANY COM application of the OIT (AOC). The operators customise the
 * AOC application; it covers flight operations (data initialization, flight log, flight summary, free text...) and the
 * weather status (TAF, METAR, SIGMET).
 *
 * The AOC of the systems host (fbw-common datalink, the same backend as the A32NX MCDU AOC pages) sends them: the OIT
 * publishes the requests on the event bus as the A32NX FMS client does (aocRequestWeather, aocSendFreetextMessage), and
 * hands a received weather report back to the AOC (aocRegisterWeatherMessages), which puts it in the COMPANY COM inbox.
 * Each request also goes into the Outbox, and into Sent once the ground acknowledges it (CompanyComDownlinks).
 *
 * Design choices (customised by the operators, no common layout):
 * - Up to four airports per weather request, METAR or TAF (as the A32NX MCDU AOC WEATHER REQ page). No SIGMET: the
 *   datalink backend has none.
 * - The free text goes to one station (callsign), four lines of 24 characters, on the Hoppie network.
 * - The airline-only functions (INIT data, NOTAM, delays, ramp service...) stay disabled: there is no airline.
 */

export const MAX_WEATHER_AIRPORTS = 4;

export const FREE_TEXT_LINES = 4;

export const FREE_TEXT_LINE_LENGTH = 24;

/** No answer of the AOC within this time: the request failed, ms */
export const COMPANY_COM_REQUEST_TIMEOUT_MS = 60_000;

/** The state of a request, shown under its SEND button */
export enum CompanyComRequestStatus {
  None = '',
  Sending = 'SENDING',
  Sent = 'SENT',
  Received = 'RECEIVED - SEE INBOX',
  Failed = 'FAILED',
}

/**
 * @param entries the airport fields of the page (null when empty)
 * @returns the airports to request, upper case, without the empty fields and the repeated ones
 */
export function weatherRequestAirports(entries: readonly (string | null)[]): string[] {
  const airports: string[] = [];
  for (const entry of entries) {
    const icao = entry?.trim().toUpperCase() ?? '';
    if (icao !== '' && !airports.includes(icao) && airports.length < MAX_WEATHER_AIRPORTS) {
      airports.push(icao);
    }
  }
  return airports;
}

/**
 * @param to the station (callsign) the text goes to
 * @param lines the text lines of the page (null when empty)
 * @returns the free text downlink, or null without a station or without a text
 */
export function freeTextMessage(to: string | null, lines: readonly (string | null)[]): FreetextMessage | null {
  const station = to?.trim().toUpperCase() ?? '';
  const text = lines
    .map((line) => line?.trim() ?? '')
    .filter((line) => line !== '')
    .join('\n');
  if (station === '' || text === '') {
    return null;
  }
  const message = new FreetextMessage();
  message.Network = AtsuMessageNetwork.Hoppie;
  message.Station = station;
  message.Message = text;
  return message;
}

/** The weather request and free text of one OIT: sends them through the AOC and follows their answers */
export class CompanyComRequests {
  private readonly subscriptions: Subscription[] = [];

  /**
   * The id of the next request. The AOC answers by request id to every client on the bus (both OITs, the FMS): the ids
   * of an OIT start far from the FMS ids (from 0) and from the other OIT.
   */
  private nextRequestId = 1_000_000 + Math.floor(Math.random() * 10_000) * 1_000;

  private weatherRequestId: number | null = null;

  private freeTextRequestId: number | null = null;

  private weatherTimeout: ReturnType<typeof setTimeout> | null = null;

  private freeTextTimeout: ReturnType<typeof setTimeout> | null = null;

  /** The Outbox / Sent entries of the request in progress */
  private weatherDownlinkId: number | null = null;

  private freeTextDownlinkId: number | null = null;

  private readonly _weatherStatus = Subject.create(CompanyComRequestStatus.None);
  public readonly weatherStatus = this._weatherStatus as Subscribable<CompanyComRequestStatus>;

  private readonly _freeTextStatus = Subject.create(CompanyComRequestStatus.None);
  public readonly freeTextStatus = this._freeTextStatus as Subscribable<CompanyComRequestStatus>;

  /**
   * @param bus the bus of the OIT
   * @param downlinks the Outbox and Sent folders the requests go into
   */
  constructor(
    private readonly bus: EventBus,
    private readonly downlinks: CompanyComDownlinks,
  ) {}

  public init(): void {
    const sub = this.bus.getSubscriber<AocFmsMessages>();
    this.subscriptions.push(
      sub.on('aocRequestSentToGround').handle((requestId) => {
        if (requestId === this.weatherRequestId) {
          this._weatherStatus.set(CompanyComRequestStatus.Sent);
          if (this.weatherDownlinkId !== null) {
            this.downlinks.markSent(this.weatherDownlinkId);
          }
        }
      }),
      sub.on('aocWeatherResponse').handle((response) => {
        if (response.requestId === this.weatherRequestId) {
          this.onWeatherResponse(response.data[0], response.data[1]);
        }
      }),
      sub.on('aocTransmissionResponse').handle((response) => {
        if (response.requestId === this.freeTextRequestId) {
          this.endFreeText(
            response.status === AtsuStatusCodes.Ok ? CompanyComRequestStatus.Sent : CompanyComRequestStatus.Failed,
          );
        }
      }),
    );
  }

  /**
   * Asks the AOC for the METAR or TAF of airports
   * @param airports the airports (weatherRequestAirports)
   * @param metar METAR, else TAF
   * @returns false when there is nothing to request or a request is in progress
   */
  public requestWeather(airports: string[], metar: boolean): boolean {
    if (airports.length === 0 || this.weatherRequestId !== null) {
      return false;
    }
    const requestId = this.nextRequestId++;
    this.weatherRequestId = requestId;
    this._weatherStatus.set(CompanyComRequestStatus.Sending);
    this.weatherDownlinkId = this.downlinks.recordDownlink({
      subject: `WEATHER REQUEST ${metar ? 'METAR' : 'TAF'}`,
      to: '',
      text: airports.join(' '),
    });
    this.weatherTimeout = setTimeout(
      () => this.endWeather(CompanyComRequestStatus.Failed),
      COMPANY_COM_REQUEST_TIMEOUT_MS,
    );
    this.bus
      .getPublisher<FmsAocMessages>()
      .pub('aocRequestWeather', { icaos: airports, requestMetar: metar, requestId }, true, false);
    return true;
  }

  /**
   * Sends a free text through the AOC
   * @param message the free text (freeTextMessage)
   * @returns false without a message or when a free text is being sent
   */
  public sendFreeText(message: FreetextMessage | null): boolean {
    if (message === null || this.freeTextRequestId !== null) {
      return false;
    }
    const requestId = this.nextRequestId++;
    this.freeTextRequestId = requestId;
    this._freeTextStatus.set(CompanyComRequestStatus.Sending);
    this.freeTextDownlinkId = this.downlinks.recordDownlink({
      subject: 'FREE TEXT',
      to: message.Station,
      text: message.Message,
    });
    this.freeTextTimeout = setTimeout(
      () => this.endFreeText(CompanyComRequestStatus.Failed),
      COMPANY_COM_REQUEST_TIMEOUT_MS,
    );
    this.bus.getPublisher<FmsAocMessages>().pub('aocSendFreetextMessage', { message, requestId }, true, false);
    return true;
  }

  private onWeatherResponse(code: AtsuStatusCodes, weather: WeatherMessage | null): void {
    if (code === AtsuStatusCodes.Ok && weather) {
      // the AOC keeps the report: it shows in the COMPANY COM inbox (CompanyComMailbox)
      this.bus.getPublisher<FmsAocMessages>().pub('aocRegisterWeatherMessages', [weather], true, false);
      this.endWeather(CompanyComRequestStatus.Received);
    } else {
      this.endWeather(CompanyComRequestStatus.Failed);
    }
  }

  private endWeather(status: CompanyComRequestStatus): void {
    if (this.weatherTimeout !== null) {
      clearTimeout(this.weatherTimeout);
      this.weatherTimeout = null;
    }
    this.weatherRequestId = null;
    this.endDownlink(this.weatherDownlinkId, status);
    this.weatherDownlinkId = null;
    this._weatherStatus.set(status);
  }

  private endFreeText(status: CompanyComRequestStatus): void {
    if (this.freeTextTimeout !== null) {
      clearTimeout(this.freeTextTimeout);
      this.freeTextTimeout = null;
    }
    this.freeTextRequestId = null;
    this.endDownlink(this.freeTextDownlinkId, status);
    this.freeTextDownlinkId = null;
    this._freeTextStatus.set(status);
  }

  /**
   * A failed request stays in the Outbox; a request the ground acknowledged before the failure stays in Sent
   * @param downlinkId the Outbox / Sent entry of the request, null without one
   * @param status how the request ended
   */
  private endDownlink(downlinkId: number | null, status: CompanyComRequestStatus): void {
    if (downlinkId === null) {
      return;
    }
    if (status === CompanyComRequestStatus.Failed) {
      this.downlinks.markNotSent(downlinkId);
    } else {
      this.downlinks.markSent(downlinkId);
    }
  }

  public destroy(): void {
    this.subscriptions.forEach((subscription) => subscription.destroy());
    if (this.weatherTimeout !== null) {
      clearTimeout(this.weatherTimeout);
    }
    if (this.freeTextTimeout !== null) {
      clearTimeout(this.freeTextTimeout);
    }
  }
}
