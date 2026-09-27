//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { EventBus, Subscription } from '@microsoft/msfs-sdk';

/**
 * The descent data of the FMS, for the flypad descent calculator: the cruise level, the destination and the distance to
 * it, the gross weight, and the managed descent speeds and speed limit of the active flight plan.
 */
export interface FmsDescentData {
  /** The request of the flypad this data answers */
  answersRequestId: number;
  /** Cruise level as a pressure altitude in feet */
  cruiseAltitude: number | null;
  destination: string | null;
  /** Destination elevation in feet */
  destinationElevation: number | null;
  /** Distance to the destination along the flight plan, in NM */
  distanceToDestination: number | null;
  /** Gross weight in kg */
  grossWeight: number | null;
  costIndex: number | null;
  /** The managed descent speed (ECON) */
  managedMach: number | null;
  managedCas: number | null;
  /** The descent speed limit: CAS in knots below a pressure altitude in feet */
  speedLimitCas: number | null;
  speedLimitAltitude: number | null;
}

export type FmsDescentDataContent = Omit<FmsDescentData, 'answersRequestId'>;

export interface FmsDescentDataEvents {
  /** The flypad asks the FMS for its descent data, with a request id */
  fms_descent_data_request: number;
  fms_descent_data: FmsDescentData;
}

/**
 * Answers the descent data requests of the flypad (only one FMS of the aircraft does).
 * @returns the subscription, to destroy with the FMS
 */
export function answerFmsDescentDataRequests(bus: EventBus, data: () => FmsDescentDataContent): Subscription {
  return bus
    .getSubscriber<FmsDescentDataEvents>()
    .on('fms_descent_data_request')
    .handle((requestId) =>
      bus
        .getPublisher<FmsDescentDataEvents>()
        .pub('fms_descent_data', { ...data(), answersRequestId: requestId }, true, false),
    );
}

/** Asks the FMS for its descent data; null when it does not answer within 3 s. */
export function requestFmsDescentData(bus: EventBus): Promise<FmsDescentData | null> {
  const requestId = Math.floor(Math.random() * 1_000_000_000);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      sub.destroy();
      resolve(null);
    }, 3_000);
    const sub = bus
      .getSubscriber<FmsDescentDataEvents>()
      .on('fms_descent_data')
      .handle((data) => {
        if (data.answersRequestId === requestId) {
          clearTimeout(timeout);
          sub.destroy();
          resolve(data);
        }
      });
    bus.getPublisher<FmsDescentDataEvents>().pub('fms_descent_data_request', requestId, true, false);
  });
}
