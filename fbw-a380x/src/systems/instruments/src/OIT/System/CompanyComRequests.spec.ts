// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { AocFmsMessages, FmsAocMessages } from '@datalink/aoc';
import { AtsuMessageNetwork, AtsuStatusCodes, WeatherMessage } from '@datalink/common';
import {
  COMPANY_COM_REQUEST_TIMEOUT_MS,
  CompanyComRequestStatus,
  CompanyComRequests,
  freeTextMessage,
  weatherRequestAirports,
} from './CompanyComRequests';
import { CompanyComDownlinks, CompanyComDownlinkStatus } from './CompanyComDownlinks';

/**
 * The OIT requests, with the AOC side of the bus
 * @returns the requests, what the OIT published, and the publisher of the AOC answers
 */
function setup() {
  const bus = new EventBus();
  const downlinks = new CompanyComDownlinks(bus, () => 0);
  downlinks.init();
  const requests = new CompanyComRequests(bus, downlinks);
  requests.init();

  const sub = bus.getSubscriber<FmsAocMessages>();
  const weatherRequests: FmsAocMessages['aocRequestWeather'][] = [];
  const freeTexts: FmsAocMessages['aocSendFreetextMessage'][] = [];
  const registered: WeatherMessage[][] = [];
  sub.on('aocRequestWeather').handle((request) => weatherRequests.push(request));
  sub.on('aocSendFreetextMessage').handle((request) => freeTexts.push(request));
  sub.on('aocRegisterWeatherMessages').handle((messages) => registered.push(messages));

  const aoc = bus.getPublisher<AocFmsMessages>();
  return { requests, weatherRequests, freeTexts, registered, aoc, downlinks };
}

describe('COMPANY COM weather request: TAF, METAR', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('takes up to four airports, upper case, without the empty and repeated fields', () => {
    expect(weatherRequestAirports(['lfpg', null, 'EGLL', 'LFPG', 'EDDF', 'KJFK', 'RJTT'])).toEqual([
      'LFPG',
      'EGLL',
      'EDDF',
      'KJFK',
    ]);
    expect(weatherRequestAirports([null, ' '])).toEqual([]);
  });

  it('asks the AOC for the METAR, follows SENDING, SENT, and gives the report to the AOC for the inbox', () => {
    const { requests, weatherRequests, registered, aoc } = setup();
    expect(requests.requestWeather(['LFPG', 'EGLL'], true)).toBe(true);
    expect(weatherRequests).toHaveLength(1);
    expect(weatherRequests[0].icaos).toEqual(['LFPG', 'EGLL']);
    expect(weatherRequests[0].requestMetar).toBe(true);
    expect(requests.weatherStatus.get()).toBe(CompanyComRequestStatus.Sending);

    const requestId = weatherRequests[0].requestId;
    aoc.pub('aocRequestSentToGround', requestId);
    expect(requests.weatherStatus.get()).toBe(CompanyComRequestStatus.Sent);

    const report = new WeatherMessage();
    aoc.pub('aocWeatherResponse', { requestId, data: [AtsuStatusCodes.Ok, report] });
    expect(requests.weatherStatus.get()).toBe(CompanyComRequestStatus.Received);
    expect(registered).toEqual([[report]]);
  });

  it('ignores the answers to the requests of other clients (the FMS, the other OIT)', () => {
    const { requests, weatherRequests, registered, aoc } = setup();
    requests.requestWeather(['LFPG'], false);
    aoc.pub('aocWeatherResponse', {
      requestId: weatherRequests[0].requestId + 1,
      data: [AtsuStatusCodes.Ok, new WeatherMessage()],
    });
    aoc.pub('aocWeatherResponse', { requestId: 0, data: [AtsuStatusCodes.Ok, new WeatherMessage()] });
    expect(requests.weatherStatus.get()).toBe(CompanyComRequestStatus.Sending);
    expect(registered).toHaveLength(0);
  });

  it('shows FAILED for an error answer, and without an answer of the AOC', () => {
    const { requests, weatherRequests, aoc } = setup();
    requests.requestWeather(['LFPG'], true);
    aoc.pub('aocWeatherResponse', {
      requestId: weatherRequests[0].requestId,
      data: [AtsuStatusCodes.ComFailed, null as unknown as WeatherMessage],
    });
    expect(requests.weatherStatus.get()).toBe(CompanyComRequestStatus.Failed);

    requests.requestWeather(['EGLL'], true);
    vi.advanceTimersByTime(COMPANY_COM_REQUEST_TIMEOUT_MS);
    expect(requests.weatherStatus.get()).toBe(CompanyComRequestStatus.Failed);
  });

  it('sends nothing without an airport', () => {
    const { requests, weatherRequests, downlinks } = setup();
    expect(requests.requestWeather([], true)).toBe(false);
    expect(weatherRequests).toHaveLength(0);
    expect(downlinks.downlinks.get()).toEqual([]);
  });

  it('keeps the request in the Outbox until the ground acknowledges it, then in Sent', () => {
    const { requests, weatherRequests, aoc, downlinks } = setup();
    requests.requestWeather(['LFPG', 'EGLL'], true);
    expect(downlinks.outbox.get().map((d) => [d.subject, d.text, d.status])).toEqual([
      ['WEATHER REQUEST METAR', 'LFPG EGLL', CompanyComDownlinkStatus.Sending],
    ]);

    aoc.pub('aocRequestSentToGround', weatherRequests[0].requestId);
    expect(downlinks.outbox.get()).toEqual([]);
    expect(downlinks.sent.get().map((d) => d.subject)).toEqual(['WEATHER REQUEST METAR']);

    // no report afterwards: the request was sent all the same
    vi.advanceTimersByTime(COMPANY_COM_REQUEST_TIMEOUT_MS);
    expect(downlinks.sent.get()).toHaveLength(1);
  });

  it('leaves an unanswered request in the Outbox, NOT SENT', () => {
    const { requests, downlinks } = setup();
    requests.requestWeather(['LFPG'], false);
    vi.advanceTimersByTime(COMPANY_COM_REQUEST_TIMEOUT_MS);
    expect(downlinks.outbox.get().map((d) => [d.subject, d.status])).toEqual([
      ['WEATHER REQUEST TAF', CompanyComDownlinkStatus.NotSent],
    ]);
  });
});

describe('COMPANY COM free text', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds a Hoppie free text to the station from the filled lines', () => {
    const message = freeTextMessage('dlh400', ['HELLO', null, ' ', 'GATE B12']);
    expect(message?.Station).toBe('DLH400');
    expect(message?.Network).toBe(AtsuMessageNetwork.Hoppie);
    expect(message?.Message).toBe('HELLO\nGATE B12');
  });

  it('has no message without a station or without a text', () => {
    expect(freeTextMessage(null, ['HELLO'])).toBeNull();
    expect(freeTextMessage('DLH400', [null, ''])).toBeNull();
  });

  it('sends it through the AOC and shows SENT, or FAILED', () => {
    const { requests, freeTexts, aoc } = setup();
    expect(requests.sendFreeText(freeTextMessage('DLH400', ['HELLO']))).toBe(true);
    expect(freeTexts).toHaveLength(1);
    expect(freeTexts[0].message.Message).toBe('HELLO');
    expect(requests.freeTextStatus.get()).toBe(CompanyComRequestStatus.Sending);
    aoc.pub('aocTransmissionResponse', { requestId: freeTexts[0].requestId, status: AtsuStatusCodes.Ok });
    expect(requests.freeTextStatus.get()).toBe(CompanyComRequestStatus.Sent);

    requests.sendFreeText(freeTextMessage('DLH400', ['AGAIN']));
    aoc.pub('aocTransmissionResponse', { requestId: freeTexts[1].requestId, status: AtsuStatusCodes.ComFailed });
    expect(requests.freeTextStatus.get()).toBe(CompanyComRequestStatus.Failed);
  });

  it('puts the free text in Sent once transmitted, in the Outbox when it failed', () => {
    const { requests, freeTexts, aoc, downlinks } = setup();
    requests.sendFreeText(freeTextMessage('DLH400', ['HELLO']));
    expect(downlinks.outbox.get().map((d) => [d.subject, d.to, d.text])).toEqual([['FREE TEXT', 'DLH400', 'HELLO']]);
    aoc.pub('aocTransmissionResponse', { requestId: freeTexts[0].requestId, status: AtsuStatusCodes.Ok });
    expect(downlinks.sent.get().map((d) => d.text)).toEqual(['HELLO']);

    requests.sendFreeText(freeTextMessage('DLH400', ['AGAIN']));
    aoc.pub('aocTransmissionResponse', { requestId: freeTexts[1].requestId, status: AtsuStatusCodes.ComFailed });
    expect(downlinks.outbox.get().map((d) => [d.text, d.status])).toEqual([
      ['AGAIN', CompanyComDownlinkStatus.NotSent],
    ]);
    expect(downlinks.sent.get()).toHaveLength(1);
  });
});
