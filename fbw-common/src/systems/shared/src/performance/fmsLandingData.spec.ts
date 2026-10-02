// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { LandingConf } from './landing';
import {
  answerFmsLandingDataRequests,
  FmsLandingDataContent,
  FmsLandingDataEvents,
  fmsQnhToHectopascal,
  requestFmsLandingData,
} from './fmsLandingData';

/** The landing data of an FMS with a destination and a PERF APPR page filled in */
const content: FmsLandingDataContent = {
  destination: 'LFPG',
  runway: '27R',
  landingWeight: 61_200,
  qnh: 1008,
  oat: 12,
  windDirection: 250,
  windSpeed: 14,
  conf: LandingConf.Full,
};

describe('FMS landing data for the flypad', () => {
  afterEach(() => vi.useRealTimers());

  it('gives the data the FMS answers to the request', async () => {
    const bus = new EventBus();
    const sub = answerFmsLandingDataRequests(bus, () => content);

    const data = await requestFmsLandingData(bus);

    expect(data).toEqual({ ...content, answersRequestId: data!.answersRequestId });
    expect(Number.isInteger(data!.answersRequestId)).toBe(true);
    sub.destroy();
  });

  it('gives null when no FMS answers within 3 s', async () => {
    vi.useFakeTimers();
    const bus = new EventBus();

    const request = requestFmsLandingData(bus);
    vi.advanceTimersByTime(2_999);
    bus.getPublisher<FmsLandingDataEvents>().pub('fms_landing_data', { ...content, answersRequestId: -1 }, true, false);
    vi.advanceTimersByTime(1);

    expect(await request).toBeNull();
  });

  it('stops answering once its subscription is destroyed', async () => {
    vi.useFakeTimers();
    const bus = new EventBus();
    answerFmsLandingDataRequests(bus, () => content).destroy();

    const request = requestFmsLandingData(bus);
    vi.advanceTimersByTime(3_000);

    expect(await request).toBeNull();
  });
});

describe('fmsQnhToHectopascal', () => {
  it('converts a QNH entered in inHg', () => {
    // 29.92 inHg = 1013 hPa, 30.12 inHg = 1020 hPa
    expect(fmsQnhToHectopascal(29.92)).toBe(1013);
    expect(fmsQnhToHectopascal(30.12)).toBe(1020);
  });

  it('keeps a QNH entered in hPa', () => {
    expect(fmsQnhToHectopascal(1013)).toBe(1013);
    expect(fmsQnhToHectopascal(100)).toBe(100);
  });

  it('gives null without a QNH', () => {
    expect(fmsQnhToHectopascal(null)).toBeNull();
    expect(fmsQnhToHectopascal(NaN)).toBeNull();
  });
});
