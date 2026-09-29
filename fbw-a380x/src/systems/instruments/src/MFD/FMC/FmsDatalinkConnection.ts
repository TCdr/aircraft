// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { AtsuStatusCodes } from '@datalink/common';
import { FmsRouterMessages } from '@datalink/router';

/**
 * Connects the datalink networks (FBW TELEX, and the Hoppie, BeyondATC or SayIntentions ACARS) with the flight number of
 * the active flight plan, whatever its source: entry on the INIT page, company flight plan uplink, activation of a
 * secondary flight plan, or a flight number already in the active flight plan when the aircraft is loaded.
 * Without this connection the ATSU cannot send any downlink (logon, requests, MAYDAY...).
 */
export class FmsDatalinkConnection {
  /** Time after which a request without an answer of the router (e.g. the systems host is not started yet) is sent again */
  private static readonly RESPONSE_TIMEOUT_MS = 10_000;

  /** Requests without an answer before the datalink is reported not available (the router may still be starting) */
  private static readonly TIMEOUTS_BEFORE_FAILURE = 2;

  private readonly publisher = this.bus.getPublisher<FmsRouterMessages>();

  /**
   * The flight number the networks are connected with, or being connected with (null = disconnected).
   * Undefined after a request got no answer, so that it is sent again.
   */
  private requestedFlightNumber: string | null | undefined = null;

  private nextRequestId = 0;

  /** The request waiting for the answer of the router */
  private pendingRequest: { id: number; isDisconnect: boolean; sentAt: number } | null = null;

  /** Requests in a row without an answer of the router */
  private timeoutsInARow = 0;

  /** Status of the last connection, for diagnostics */
  public lastConnectionStatus: AtsuStatusCodes | null = null;

  /** Whether the datalink is currently reported not available */
  private failed = false;

  /**
   * @param bus the event bus
   * @param onFailure called once when the connection fails (refused, or no answer of the router)
   */
  constructor(
    private readonly bus: EventBus,
    private readonly onFailure: () => void = () => {},
  ) {
    this.bus
      .getSubscriber<FmsRouterMessages>()
      .on('routerManagementResponse')
      .handle((response) => this.onRouterResponse(response.requestId, response.status));
  }

  /** Whether the datalink is available: connected with the flight number, or no flight number to connect with */
  public get isAvailable(): boolean {
    return !this.failed;
  }

  /** Connects again with the same flight number, e.g. when the flight crew enters it again after a failure */
  public reconnect(): void {
    if (this.pendingRequest === null) {
      this.requestedFlightNumber = undefined;
      // A new failure is reported again
      this.failed = false;
    }
  }

  /**
   * To be called periodically with the flight number of the active flight plan.
   * @param flightNumber the flight number of the active flight plan, null if none
   * @param now the current time in ms
   */
  public update(flightNumber: string | null, now = Date.now()): void {
    if (this.pendingRequest !== null) {
      if (now - this.pendingRequest.sentAt < FmsDatalinkConnection.RESPONSE_TIMEOUT_MS) {
        return;
      }
      // No answer: the request is lost, send it again
      this.pendingRequest = null;
      this.requestedFlightNumber = undefined;
      this.timeoutsInARow++;
      if (this.timeoutsInARow >= FmsDatalinkConnection.TIMEOUTS_BEFORE_FAILURE && flightNumber !== null) {
        this.setFailed(true);
      }
    }

    if (flightNumber === this.requestedFlightNumber) {
      return;
    }

    // A new flight number: the old connection is closed first, then the new one is opened
    this.requestedFlightNumber = flightNumber;
    if (flightNumber === null) {
      this.setFailed(false);
    }
    this.send(true, now);
  }

  private onRouterResponse(requestId: number, status: AtsuStatusCodes): void {
    if (this.pendingRequest === null || this.pendingRequest.id !== requestId) {
      return;
    }

    const wasDisconnect = this.pendingRequest.isDisconnect;
    this.pendingRequest = null;
    this.timeoutsInARow = 0;

    if (wasDisconnect) {
      if (this.requestedFlightNumber) {
        this.send(false, Date.now());
      }
    } else {
      this.lastConnectionStatus = status;
      if (status !== AtsuStatusCodes.Ok) {
        console.warn(`[FMS] Datalink connection with ${this.requestedFlightNumber} failed: ${status}`);
      }
      this.setFailed(status !== AtsuStatusCodes.Ok);
    }
  }

  private setFailed(failed: boolean): void {
    if (failed && !this.failed) {
      this.failed = true;
      this.onFailure();
    } else if (!failed) {
      this.failed = false;
    }
  }

  private send(isDisconnect: boolean, now: number): void {
    const id = this.nextRequestId++;
    this.pendingRequest = { id, isDisconnect, sentAt: now };
    if (isDisconnect) {
      this.publisher.pub('routerDisconnect', id, true, false);
    } else {
      this.publisher.pub('routerConnect', { callsign: this.requestedFlightNumber ?? '', requestId: id }, true, false);
    }
  }
}
