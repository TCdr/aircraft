//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { EventBus, Subscription } from '@microsoft/msfs-sdk';

import { LandingConf } from './landing';

/**
 * The landing data of the FMS, for the flypad landing calculator: the destination of the active flight plan, the
 * predicted landing weight, and the destination conditions of the approach page (PERF APPR).
 */
export interface FmsLandingData {
  /** The request of the flypad this data answers */
  answersRequestId: number;
  destination: string | null;
  /** Runway ident without the airport, e.g. 27L */
  runway: string | null;
  /** Landing weight in kg */
  landingWeight: number | null;
  /** QNH in hPa */
  qnh: number | null;
  /** Temperature in °C */
  oat: number | null;
  /** Wind direction in degrees magnetic, and speed in knots */
  windDirection: number | null;
  windSpeed: number | null;
  conf: LandingConf.Conf3 | LandingConf.Full | null;
}

export type FmsLandingDataContent = Omit<FmsLandingData, 'answersRequestId'>;

export interface FmsLandingDataEvents {
  /** The flypad asks the FMS for its landing data, with a request id */
  fms_landing_data_request: number;
  fms_landing_data: FmsLandingData;
}

/**
 * Answers the landing data requests of the flypad (only one FMS of the aircraft does).
 * @returns the subscription, to destroy with the FMS
 */
export function answerFmsLandingDataRequests(bus: EventBus, data: () => FmsLandingDataContent): Subscription {
  return bus
    .getSubscriber<FmsLandingDataEvents>()
    .on('fms_landing_data_request')
    .handle((requestId) =>
      bus
        .getPublisher<FmsLandingDataEvents>()
        .pub('fms_landing_data', { ...data(), answersRequestId: requestId }, true, false),
    );
}

/** Asks the FMS for its landing data; null when it does not answer within 3 s. */
export function requestFmsLandingData(bus: EventBus): Promise<FmsLandingData | null> {
  const requestId = Math.floor(Math.random() * 1_000_000_000);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      sub.destroy();
      resolve(null);
    }, 3_000);
    const sub = bus
      .getSubscriber<FmsLandingDataEvents>()
      .on('fms_landing_data')
      .handle((data) => {
        if (data.answersRequestId === requestId) {
          clearTimeout(timeout);
          sub.destroy();
          resolve(data);
        }
      });
    bus.getPublisher<FmsLandingDataEvents>().pub('fms_landing_data_request', requestId, true, false);
  });
}

/** The approach QNH of the FMS, entered in hPa or in inHg, in hPa */
export function fmsQnhToHectopascal(qnh: number | null): number | null {
  if (qnh === null || !Number.isFinite(qnh)) {
    return null;
  }
  return qnh < 100 ? Math.round(qnh * 33.8639) : qnh;
}
