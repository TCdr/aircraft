// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FreetextMessage } from '@datalink/common';
import { Subscribable, Subscription } from '@microsoft/msfs-sdk';
import { freeTextMessage } from './CompanyComRequests';
import { ReportWeightUnit, hhmmOf, weightEntryOf } from './CompanyComReportForms';

/*
 * The OOOI reports: the AOC sends them by itself when the aircraft goes OUT (doors closed, parking brake off), OFF
 * (airborne), ON (landed) and IN (parking brake set at the gate), so that the operator knows the progress of the flight.
 * Each one is a free text to the OOOI station on the Hoppie network, through the same path as the report forms.
 *
 * Design choice: the operators customise the triggers and the layout, so there is a single layout (flight, airports, the
 * event with its time UTC and the fuel on board). Without an OOOI station the reports wait and go out as soon as the
 * crew enters one, in the order they happened.
 */

export type OooiEvent = 'OUT' | 'OFF' | 'ON' | 'IN';

/** The flight identification at the time of an event */
export interface OooiFlightIdentification {
  readonly flightNumber: string | null;
  readonly origin: string | null;
  readonly destination: string | null;
}

interface WaitingReport {
  readonly event: OooiEvent;
  readonly time: number;
  readonly fuelKg: number | null;
  readonly flight: OooiFlightIdentification;
}

/**
 * @param event the event
 * @param time the time of the event, ms since the epoch (UTC)
 * @param fuelKg the fuel on board at the event, kg, null when unknown
 * @param flight the flight identification
 * @param station the OOOI station (callsign)
 * @param unit the weight unit of the aircraft
 * @returns the free text to send, null without a station
 */
export function oooiMessage(
  event: OooiEvent,
  time: number,
  fuelKg: number | null,
  flight: OooiFlightIdentification,
  station: string | null,
  unit: ReportWeightUnit,
): FreetextMessage | null {
  const fuel = weightEntryOf(fuelKg, unit);
  return freeTextMessage(station, [
    `OOOI ${event}`,
    flight.flightNumber ? `FLT NBR ${flight.flightNumber}` : null,
    flight.origin ? `FROM ${flight.origin}` : null,
    flight.destination ? `DEST ${flight.destination}` : null,
    `${event} ${hhmmOf(time)}`,
    fuel === null ? null : `FOB ${fuel} ${unit}`,
  ]);
}

/** Sends the OOOI reports as they happen, or as soon as there is a station to send them to */
export class OooiReports {
  private waiting: WaitingReport[] = [];

  private readonly stationSubscription: Subscription;

  /**
   * @param station the OOOI station (callsign)
   * @param send sends a message through the AOC under a key; false when it could not be sent
   * @param unit the weight unit of the aircraft, read when a report goes out
   */
  constructor(
    private readonly station: Subscribable<string | null>,
    private readonly send: (key: string, subject: string, message: FreetextMessage | null) => boolean,
    private readonly unit: () => ReportWeightUnit,
  ) {
    this.stationSubscription = station.sub(() => this.sendWaiting());
  }

  /**
   * An event happened: sends its report, or keeps it until there is a station
   * @param event the event
   * @param time the time of the event, ms since the epoch (UTC)
   * @param fuelKg the fuel on board at the event, kg, null when unknown
   * @param flight the flight identification
   */
  public report(event: OooiEvent, time: number, fuelKg: number | null, flight: OooiFlightIdentification): void {
    this.waiting.push({ event, time, fuelKg, flight });
    this.sendWaiting();
  }

  /** Forgets the reports not sent yet (OIT reset) */
  public clear(): void {
    this.waiting = [];
  }

  public destroy(): void {
    this.stationSubscription.destroy();
  }

  private sendWaiting(): void {
    const station = this.station.get();
    if (station === null || station.trim() === '') {
      return;
    }
    const unit = this.unit();
    const notSent: WaitingReport[] = [];
    for (const report of this.waiting) {
      const message = oooiMessage(report.event, report.time, report.fuelKg, report.flight, station, unit);
      if (!this.send(`oooi/${report.event.toLowerCase()}`, `OOOI ${report.event}`, message)) {
        notSent.push(report);
      }
    }
    this.waiting = notSent;
  }
}
