// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import {
  answerFmsDescentDataRequests,
  FmsDescentDataContent,
  FmsDescentDataEvents,
  requestFmsDescentData,
} from './fmsDescentData';

/** The descent data of an FMS with a flight plan */
const content: FmsDescentDataContent = {
  cruiseAltitude: 37_000,
  destination: 'CYVR',
  destinationElevation: 14,
  distanceToDestination: 1960,
  grossWeight: 66_500,
  costIndex: 30,
  managedMach: 0.78,
  managedCas: 300,
  speedLimitCas: 250,
  speedLimitAltitude: 10_000,
  waypoints: [{ ident: 'BOOTH', distance: 1930, constraint: { type: 'at', altitude1: 8000 } }],
};

describe('FMS descent data for the flypad', () => {
  afterEach(() => vi.useRealTimers());

  it('gives the data the FMS answers to the request', async () => {
    const bus = new EventBus();
    answerFmsDescentDataRequests(bus, () => content);

    const data = await requestFmsDescentData(bus);

    expect(data).not.toBeNull();
    expect(data?.destination).toBe('CYVR');
    expect(data?.waypoints).toEqual(content.waypoints);
  });

  it('gives an empty waypoint list when the FMS answers without one (an FMS built before the waypoints)', async () => {
    const bus = new EventBus();
    // an older FMS: the same answer without the waypoints field
    const { waypoints: _, ...older } = content;
    bus
      .getSubscriber<FmsDescentDataEvents>()
      .on('fms_descent_data_request')
      .handle((requestId) =>
        bus
          .getPublisher<FmsDescentDataEvents>()
          .pub('fms_descent_data', { ...older, answersRequestId: requestId } as any, true, false),
      );

    const data = await requestFmsDescentData(bus);

    expect(data?.destination).toBe('CYVR');
    expect(data?.waypoints).toEqual([]);
  });

  it('gives null when no FMS answers within 3 s', async () => {
    vi.useFakeTimers();
    const bus = new EventBus();

    const request = requestFmsDescentData(bus);
    vi.advanceTimersByTime(3_000);

    expect(await request).toBeNull();
  });

  it('ignores the answers to the requests of another flypad', async () => {
    vi.useFakeTimers();
    const bus = new EventBus();

    const request = requestFmsDescentData(bus);
    bus.getPublisher<FmsDescentDataEvents>().pub('fms_descent_data', { ...content, answersRequestId: -1 }, true, false);
    vi.advanceTimersByTime(3_000);

    expect(await request).toBeNull();
  });
});
