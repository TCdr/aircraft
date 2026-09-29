// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { AtsuStatusCodes } from '@datalink/common';
import { FmsRouterMessages } from '@datalink/router';
import { FmsDatalinkConnection } from './FmsDatalinkConnection';

/** A router answering every request, recording them */
function createRouter(bus: EventBus, answer = true, connectStatus = AtsuStatusCodes.Ok) {
  const requests: string[] = [];
  const sub = bus.getSubscriber<FmsRouterMessages>();
  const pub = bus.getPublisher<FmsRouterMessages>();
  sub.on('routerDisconnect').handle((requestId) => {
    requests.push('disconnect');
    if (answer) {
      pub.pub('routerManagementResponse', { requestId, status: AtsuStatusCodes.Ok });
    }
  });
  sub.on('routerConnect').handle(({ requestId, callsign }) => {
    requests.push(`connect ${callsign}`);
    if (answer) {
      pub.pub('routerManagementResponse', { requestId, status: connectStatus });
    }
  });
  return requests;
}

describe('FmsDatalinkConnection', () => {
  it('connects the networks with a flight number already in the active flight plan', () => {
    const bus = new EventBus();
    const requests = createRouter(bus);
    const connection = new FmsDatalinkConnection(bus);
    connection.update('D8FBW', 0);
    expect(requests).toEqual(['disconnect', 'connect D8FBW']);
    expect(connection.lastConnectionStatus).toBe(AtsuStatusCodes.Ok);
  });

  it('does nothing while the flight number does not change, reconnects when it changes', () => {
    const bus = new EventBus();
    const requests = createRouter(bus);
    const connection = new FmsDatalinkConnection(bus);
    connection.update(null, 0);
    connection.update('D8FBW', 100);
    connection.update('D8FBW', 200);
    connection.update('AFR123', 300);
    connection.update(null, 400);
    expect(requests).toEqual(['disconnect', 'connect D8FBW', 'disconnect', 'connect AFR123', 'disconnect']);
  });

  it('sends the request again when the router does not answer', () => {
    const bus = new EventBus();
    const requests = createRouter(bus, false);
    const connection = new FmsDatalinkConnection(bus);
    connection.update('D8FBW', 0);
    connection.update('D8FBW', 5_000);
    expect(requests).toEqual(['disconnect']);
    connection.update('D8FBW', 10_000);
    expect(requests).toEqual(['disconnect', 'disconnect']);
  });

  it('reports a refused connection, and connects again when the flight number is entered again', () => {
    const bus = new EventBus();
    const requests = createRouter(bus, true, AtsuStatusCodes.CallsignInUse);
    let failures = 0;
    const connection = new FmsDatalinkConnection(bus, () => failures++);
    connection.update('D8FBW', 0);
    connection.update('D8FBW', 100);
    expect(failures).toBe(1);
    expect(connection.isAvailable).toBe(false);
    connection.reconnect();
    connection.update('D8FBW', 200);
    expect(requests).toEqual(['disconnect', 'connect D8FBW', 'disconnect', 'connect D8FBW']);
    expect(failures).toBe(2);
    // No flight number any more: nothing to connect, the message is cleared
    connection.update(null, 300);
    expect(connection.isAvailable).toBe(true);
  });

  it('reports the datalink not available after two requests without an answer of the router', () => {
    const bus = new EventBus();
    createRouter(bus, false);
    let failures = 0;
    const connection = new FmsDatalinkConnection(bus, () => failures++);
    connection.update('D8FBW', 0);
    connection.update('D8FBW', 10_000);
    expect(failures).toBe(0);
    connection.update('D8FBW', 20_000);
    expect(failures).toBe(1);
    expect(connection.isAvailable).toBe(false);
  });
});
