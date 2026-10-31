// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MutableSubscribable } from '@microsoft/msfs-sdk';
import type { BuildInfo } from '@flybywiresim/fbw-sdk';
import { OIS_MONTHS } from './OisDateTime';

export type FltOpsLaptopIndex = 1 | 2;

/** The flight of the FLT OPS STS page: FLT NBR, FROM and TO */
export interface FltOpsStatusFlight {
  readonly fltNumber: string | null;
  readonly from: string | null;
  readonly to: string | null;
}

/** The FLT OPS STS page of a laptop, as one laptop sends it to the other over the FLT OPS network */
export interface FltOpsStatusPageMessage {
  readonly sender: FltOpsLaptopIndex;
  readonly flight: FltOpsStatusFlight;
  /** The page takes the FMS changes: no manual entry since the start of the page or the last SYNCHRO AVIONICS */
  readonly followsFms: boolean;
}

/** The FLT OPS STS exchanges between the CAPT and F/O laptops, synced to the other OIT instrument */
export interface FltOpsStatusNetworkEvents {
  /** A laptop changed its FLT OPS STS page, or answers a request */
  oisFltOpsStsPage: FltOpsStatusPageMessage;
  /** A laptop that joins the network asks for the FLT OPS STS page of the other laptop */
  oisFltOpsStsRequest: FltOpsLaptopIndex;
}

/** How a laptop reaches the other laptop */
export interface FltOpsStatusNetwork {
  sendPage(message: FltOpsStatusPageMessage): void;
  requestPage(sender: FltOpsLaptopIndex): void;
}

/** The fields of the FLT OPS STS page that the crew can change */
export interface FltOpsStatusFields {
  readonly fltNumber: MutableSubscribable<string | null>;
  readonly fromAirport: MutableSubscribable<string | null>;
  readonly toAirport: MutableSubscribable<string | null>;
}

export type FltOpsStatusField = keyof FltOpsStatusFields;

/**
 * The avionics data reach the FLT OPS side one way only: through the secure communication interfaces (SCIs) to the
 * NSS AVNCS servers, then through the diode to the FLT OPS network.
 * Design choice: a laptop off the network (stand-alone) gets no avionics data, as it gets no ECAM alerts.
 * @param connected the laptop runs and is connected to the FLT OPS network
 * @param nssAvncsAvailable an NSS AVNCS server runs
 * @param avionicsDataReachNss the avionics data reach the NSS AVNCS side: at least one SCI works
 * @param diodeAvailable the one-way link from the NSS AVNCS side to the FLT OPS network works
 * @returns whether the FMS flight number and city pair reach the laptop
 */
export function fmsDataReachLaptop(
  connected: boolean,
  nssAvncsAvailable: boolean,
  avionicsDataReachNss: boolean,
  diodeAvailable: boolean,
): boolean {
  return connected && nssAvncsAvailable && avionicsDataReachNss && diodeAvailable;
}

/**
 * The FLT OPS STS page of one laptop and its synchronisation with the page of the other laptop:
 * - It takes the FMS flight number and city pair automatically, until the crew makes a manual entry; SYNCHRO
 *   AVIONICS takes the FMS values again and the page follows the FMS again.
 * - A change on one laptop (manual entry, SYNCHRO AVIONICS, EXIT SESSION) updates the page of the other laptop. A
 *   laptop that joins the network gets the page of the other laptop.
 * - A stand-alone laptop exchanges nothing ("SYNCHRONIZATION NOT AVAIL").
 * - A laptop that lost the network and got it back no longer exchanges its manual entries: both laptops must be
 *   restarted to synchronise again.
 */
export class FltOpsStatusSync {
  private followsFms = true;

  private running = false;

  private connected = false;

  /** The laptop lost the network since its start: the synchronisation stays partial until it restarts */
  private partiallySynchronised = false;

  constructor(
    private readonly laptop: FltOpsLaptopIndex,
    private readonly fields: FltOpsStatusFields,
    private readonly network: FltOpsStatusNetwork,
  ) {}

  /**
   * @param running the laptop is switched on and healthy
   * @param connected the laptop is connected to the FLT OPS network
   * @param fms the FMS flight, null when the FMS data do not reach the laptop
   */
  public update(running: boolean, connected: boolean, fms: FltOpsStatusFlight | null): void {
    const linked = running && connected;
    const wasLinked = this.running && this.connected;
    if (running && !this.running) {
      // A laptop keeps the page in its memory only
      this.show({ fltNumber: null, from: null, to: null });
      this.followsFms = true;
      this.partiallySynchronised = false;
    } else if (running && wasLinked && !linked) {
      this.partiallySynchronised = true;
    }
    this.running = running;
    this.connected = connected;

    if (linked && !wasLinked && this.exchanges()) {
      this.network.requestPage(this.laptop);
    }
    if (running && this.followsFms && fms !== null) {
      this.show(fms);
    }
  }

  /**
   * A manual entry on the page: the page no longer takes the FMS changes
   * @param field the field
   * @param value the entry, null when cleared
   */
  public enter(field: FltOpsStatusField, value: string | null): void {
    this.fields[field].set(value);
    this.followsFms = false;
    this.sendPage();
  }

  /**
   * SYNCHRO AVIONICS: takes the FMS values, and the page follows the FMS again
   * @param fms the FMS flight, null when the FMS data do not reach the laptop
   */
  public synchroAvionics(fms: FltOpsStatusFlight | null): void {
    if (fms === null) {
      return;
    }
    this.show(fms);
    this.followsFms = true;
    this.sendPage();
  }

  /** EXIT SESSION: the page of both laptops starts again for the next flight, taking the FMS values again */
  public exitSession(): void {
    this.show({ fltNumber: null, from: null, to: null });
    this.followsFms = true;
    this.sendPage();
  }

  /** @param message the page of the other laptop changed */
  public receivePage(message: FltOpsStatusPageMessage): void {
    if (message.sender === this.laptop || !this.exchanges()) {
      return;
    }
    this.show(message.flight);
    this.followsFms = message.followsFms;
  }

  /** @param sender the other laptop joined the network and asks for this page */
  public receiveRequest(sender: FltOpsLaptopIndex): void {
    if (sender !== this.laptop) {
      this.sendPage();
    }
  }

  private exchanges(): boolean {
    return this.running && this.connected && !this.partiallySynchronised;
  }

  private sendPage(): void {
    if (this.exchanges()) {
      this.network.sendPage({
        sender: this.laptop,
        flight: {
          fltNumber: this.fields.fltNumber.get(),
          from: this.fields.fromAirport.get(),
          to: this.fields.toAirport.get(),
        },
        followsFms: this.followsFms,
      });
    }
  }

  private show(flight: FltOpsStatusFlight): void {
    this.fields.fltNumber.set(flight.fltNumber);
    this.fields.fromAirport.set(flight.from);
    this.fields.toAirport.set(flight.to);
  }
}

/**
 * The OIS VERSION line of the FLT OPS STS page: the date of the software and its version, e.g. 14-JUL-08 V2.0.
 * Design choice: the OIS software is the aircraft build, so its build date and its release number (without the
 * development suffix).
 * @param info the build information
 * @returns the line, empty when the build information is not readable
 */
export function oisVersionLabel(info: Pick<BuildInfo, 'built' | 'version'>): string {
  const built = info.built ? new Date(info.built) : null;
  const release = /^(?:[a-z0-9]+-)?v?(\d+(?:\.\d+)*)/i.exec(info.version || '');
  if (built === null || isNaN(built.getTime()) || release === null) {
    return '';
  }
  const day = String(built.getUTCDate()).padStart(2, '0');
  const year = String(built.getUTCFullYear() % 100).padStart(2, '0');
  return `${day}-${OIS_MONTHS[built.getUTCMonth()]}-${year} V${release[1]}`;
}

/**
 * The ACFT REGISTRATION list of the FLT OPS STS page: the registration the sim gives the aircraft (its ATC ID)
 * @param atcId the ATC ID of the aircraft
 * @returns the list, empty when the sim gives none
 */
export function registrationList(atcId: unknown): string[] {
  const registration = typeof atcId === 'string' ? atcId.trim().toUpperCase() : '';
  return registration ? [registration] : [];
}
