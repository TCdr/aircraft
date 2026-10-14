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

/**
 * The OIT requests, with the AOC side of the bus
 * @returns the requests, what the OIT published, and the publisher of the AOC answers
 */
function setup() {
  const bus = new EventBus();
  const requests = new CompanyComRequests(bus);
  requests.init();

  const sub = bus.getSubscriber<FmsAocMessages>();
  const weatherRequests: FmsAocMessages['aocRequestWeather'][] = [];
  const freeTexts: FmsAocMessages['aocSendFreetextMessage'][] = [];
  const registered: WeatherMessage[][] = [];
  sub.on('aocRequestWeather').handle((request) => weatherRequests.push(request));
  sub.on('aocSendFreetextMessage').handle((request) => freeTexts.push(request));
  sub.on('aocRegisterWeatherMessages').handle((messages) => registered.push(messages));

  const aoc = bus.getPublisher<AocFmsMessages>();
  return { requests, weatherRequests, freeTexts, registered, aoc };
}

describe('COMPANY COM weather request (A380 FCOM DSC-46-40, a380_fcom.txt l.107844: TAF, METAR)', () => {
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
    const { requests, weatherRequests } = setup();
    expect(requests.requestWeather([], true)).toBe(false);
    expect(weatherRequests).toHaveLength(0);
  });
});

describe('COMPANY COM free text (A380 FCOM DSC-46-40, a380_fcom.txt l.107841: free text)', () => {
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
});
