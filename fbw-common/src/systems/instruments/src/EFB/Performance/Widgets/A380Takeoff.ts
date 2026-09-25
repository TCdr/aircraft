// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { CompanyTakeoffDataEvents, CompanyTakeoffDataRequest, CompanyTakeoffDataUplink } from '@flybywiresim/fbw-sdk';

/**
 * The takeoff data requests sent by the A380X FMS with SEND T.O REQUEST (COMPANY T.O DATA REQUEST page): the flypad
 * takeoff calculator plays the company ground station, and keeps the last request from the start of the flypad on.
 */
export const CompanyTakeoffRequests = {
  last: null as CompanyTakeoffDataRequest | null,

  listeners: new Set<(request: CompanyTakeoffDataRequest) => void>(),

  subscribe(listener: (request: CompanyTakeoffDataRequest) => void): () => void {
    CompanyTakeoffRequests.listeners.add(listener);
    return () => CompanyTakeoffRequests.listeners.delete(listener);
  },

  /** Keeps the requests the FMS sends from now on; returns the function that stops it. */
  connect(bus: EventBus): () => void {
    const sub = bus
      .getSubscriber<CompanyTakeoffDataEvents>()
      .on('cpny_to_fms_data')
      .handle((request) => {
        if (request.answersRequestId === null) {
          CompanyTakeoffRequests.last = request;
          CompanyTakeoffRequests.listeners.forEach((l) => l(request));
        }
      });
    return () => sub.destroy();
  },
};

/** Asks the FMS for its takeoff data (flight plan and load data); null when it does not answer within 3 s. */
export function requestFmsTakeoffData(bus: EventBus): Promise<CompanyTakeoffDataRequest | null> {
  const requestId = Math.floor(Math.random() * 1_000_000_000);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      sub.destroy();
      resolve(null);
    }, 3_000);
    const sub = bus
      .getSubscriber<CompanyTakeoffDataEvents>()
      .on('cpny_to_fms_data')
      .handle((data) => {
        if (data.answersRequestId === requestId) {
          clearTimeout(timeout);
          sub.destroy();
          resolve(data);
        }
      });
    bus.getPublisher<CompanyTakeoffDataEvents>().pub('cpny_to_fms_data_request', requestId, true, false);
  });
}

/** Uplinks takeoff data to the FMS, as company takeoff data (inserted from the RECEIVED COMPANY T.O DATA page). */
export function sendTakeoffDataToFms(bus: EventBus, uplink: CompanyTakeoffDataUplink): void {
  bus.getPublisher<CompanyTakeoffDataEvents>().pub('cpny_to_uplink', uplink, true, false);
}
