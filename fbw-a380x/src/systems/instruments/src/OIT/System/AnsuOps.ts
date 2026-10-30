// Copyright (c) 2025 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject, Subscription } from '@microsoft/msfs-sdk';
import { AircraftNetworkServerUnit } from './AircraftNetworkServerUnit';
import { NXDataStore, NXLogicConfirmNode, UpdateThrottler } from '@flybywiresim/fbw-sdk';
import { CompanyComMailbox } from './CompanyComMailbox';
import { CompanyComRequests } from './CompanyComRequests';
import { CompanyComDownlinks } from './CompanyComDownlinks';
import { CompanyComReports } from './CompanyComReports';
import { OisMessageToolbar } from './OisMessageToolbar';
import { TechLogbookStore } from './TechLogbookStore';
import { formatOisDateTime, OIS_MONTHS } from './OisDateTime';
import { OitPageDrafts } from './OitPageDrafts';
import { linkDegradedToolbarText } from './NssAvionicsLink';
import { OooiEvent, OooiReports } from './OooiReports';
import { ReportWeightUnit } from './CompanyComReportForms';

export class AnsuOps extends AircraftNetworkServerUnit {
  private lastUpdateTime: number | undefined = undefined;
  private startStateRecorded = false;
  private readonly ansuUpdateThrottler = new UpdateThrottler(500); // has to be > 100 due to pulse nodes

  // OOOI times, ref: https://patents.google.com/patent/US6308044B1/en
  // Times stored in seconds since epoch
  private readonly parkBrakeOffTime = Subject.create<number | null>(null);
  private readonly takeoffTime = Subject.create<number | null>(null);
  private readonly touchdownTime = Subject.create<number | null>(null);
  private readonly parkBrakeOnTime = Subject.create<number | null>(null);

  public readonly outBlockTime = Subject.create<number | null>(null);
  public readonly offBlockTime = Subject.create<number | null>(null);
  public readonly onBlockTime = Subject.create<number | null>(null);
  public readonly inBlockTime = Subject.create<number | null>(null);

  /** in kgs */
  private readonly parkBrakeOffFob = Subject.create<number | null>(null);
  private readonly takeoffFob = Subject.create<number | null>(null);
  private readonly touchdownFob = Subject.create<number | null>(null);
  private readonly parkBrakeOnFob = Subject.create<number | null>(null);

  public readonly outBlockFob = Subject.create<number | null>(null);
  public readonly offBlockFob = Subject.create<number | null>(null);
  public readonly onBlockFob = Subject.create<number | null>(null);
  public readonly inBlockFob = Subject.create<number | null>(null);

  private readonly offBlockConfNode = new NXLogicConfirmNode(10);
  private readonly onBlockConfNode = new NXLogicConfirmNode(10);
  private readonly turnaroundConfNode = new NXLogicConfirmNode(15 * 60); // Reset times only after at least 15 minutes

  /** in milliseconds */
  public readonly blockTime = Subject.create<number | null>(null);
  public readonly flightTime = Subject.create<number | null>(null);

  /** The COMPANY COM inbox (AOC uplink messages), kept here so that it lives across the OIT page changes */
  public readonly companyCom = new CompanyComMailbox(this.bus);

  /** The COMPANY COM Outbox and Sent folders: the downlinks sent from this OIT */
  public readonly companyComDownlinks = new CompanyComDownlinks(this.bus, () => this.sci.zuluTime.get());

  /** The COMPANY COM weather request and free text (AOC downlinks), kept here across the OIT page changes */
  public readonly companyComRequests = new CompanyComRequests(this.bus, this.companyComDownlinks);

  /** The COMPANY COM report and request forms (AOC downlinks), kept here across the OIT page changes */
  public readonly companyComReports = new CompanyComReports(this.bus, this.companyComDownlinks);

  /** The OOOI reports the AOC sends by itself when the aircraft goes out, off, on and in */
  private readonly oooiReports = new OooiReports(
    this.companyComReports.oooiStation,
    (key, subject, message) => this.companyComReports.send(key, subject, message),
    () => (NXDataStore.getSetting('CONFIG_USING_METRIC_UNIT').get() ? 'KG' : 'LB') as ReportWeightUnit,
  );

  /** What the crew typed on the pages of the open NSS AVNCS applications, kept while a page is drawn again */
  public readonly pageDrafts = new OitPageDrafts();

  /** The message toolbar of the NSS AVNCS menu bar of this OIT */
  public readonly messageToolbar = new OisMessageToolbar();

  /** The technical logbook, kept here across the OIT page changes; it reuses the flight log values */
  public readonly techLogbook = new TechLogbookStore(this.bus, this.sci, this);

  /** @inheritdoc */
  init(): void {
    super.init();

    this.companyCom.init();
    this.companyComDownlinks.init();
    this.companyComRequests.init();
    this.companyComReports.init();
    this.companyCom.onNewUplink((entry) => this.messageToolbar.postAocNotification(entry.uid, entry.subject));
    this.companyCom.onUplinkHandled((uid) => this.messageToolbar.removeAocNotification(uid));
    this.techLogbook.init();

    this.subscriptions.push(
      this.reportOnSet('OUT', this.outBlockTime, this.outBlockFob),
      this.reportOnSet('OFF', this.offBlockTime, this.offBlockFob),
      this.reportOnSet('ON', this.onBlockTime, this.onBlockFob),
      this.reportOnSet('IN', this.inBlockTime, this.inBlockFob),
      this.sci.link.sub((link) => {
        const text = linkDegradedToolbarText(link);
        if (text !== null) {
          this.messageToolbar.post(text);
        }
      }),
      this.sci.parkBrakeSet.sub((set) => this.recordParkBrake(set)),
      this.sci.onGround.sub((onGround) => this.recordGround(onGround)),
    );
  }

  /**
   * Records the time and the fuel on board of a park brake change
   * @param set whether the park brake is set now
   */
  private recordParkBrake(set: boolean): void {
    if (set) {
      this.parkBrakeOnTime.set(this.sci.zuluTime.get());
      this.parkBrakeOnFob.set(this.sci.fqmsFuelQuantity.get().valueOr(null));
    } else {
      this.parkBrakeOffTime.set(this.sci.zuluTime.get());
      this.parkBrakeOffFob.set(this.sci.fqmsFuelQuantity.get().valueOr(null));
    }
  }

  /**
   * Records the time and the fuel on board of a change between ground and air
   * @param onGround whether the aircraft is on the ground now
   */
  private recordGround(onGround: boolean): void {
    if (onGround) {
      this.touchdownTime.set(this.sci.zuluTime.get());
      this.touchdownFob.set(this.sci.fqmsFuelQuantity.get().valueOr(null));
    } else {
      this.takeoffTime.set(this.sci.zuluTime.get());
      this.takeoffFob.set(this.sci.fqmsFuelQuantity.get().valueOr(null));
    }
  }

  /**
   * The state the aircraft starts in counts as the last change. It is recorded at the first update, not at init: the
   * sim clock and the avionics data have not arrived by then, the time would be the one of the PC and the fuel unknown.
   */
  private recordStartState(): void {
    this.startStateRecorded = true;
    this.recordParkBrake(this.sci.parkBrakeSet.get());
    this.recordGround(this.sci.onGround.get());
  }

  /**
   * Sends the OOOI report of an event as soon as its time is set. The fuel on board is set before the time, so that the
   * report sees both.
   * @param event the OOOI event
   * @param time the time of the event
   * @param fuel the fuel on board at the event
   * @returns the subscription
   */
  private reportOnSet(event: OooiEvent, time: Subject<number | null>, fuel: Subject<number | null>): Subscription {
    return time.sub((t) => {
      if (t !== null) {
        this.oooiReports.report(event, t, fuel.get(), {
          flightNumber: this.sci.fltNumber.get(),
          origin: this.sci.fltOrigin.get(),
          destination: this.sci.fltDestination.get(),
        });
      }
    });
  }

  /** @inheritdoc */
  onUpdate(): void {
    super.onUpdate();
    if (!this.startStateRecorded) {
      this.recordStartState();
    }
    const _deltaTime = this.lastUpdateTime === undefined ? 1_000 : this.sci.zuluTime.get() - this.lastUpdateTime;
    this.lastUpdateTime = this.sci.zuluTime.get();

    const deltaTime = this.ansuUpdateThrottler.canUpdate(_deltaTime);

    // Enforce cycle time for the logic computation (otherwise pulse nodes would be broken)
    if (deltaTime === -1 || _deltaTime === 0) {
      return;
    }

    this.updateOooiTimes(deltaTime);
    this.techLogbook.update(this.sci.zuluTime.get());
  }

  private updateOooiTimes(deltaTime: number): void {
    // OOOI
    // Out Block: Doors closed & park brake released
    this.turnaroundConfNode.write(
      this.outBlockTime.get() !== null &&
        this.offBlockTime.get() !== null &&
        this.onBlockTime.get() !== null &&
        this.inBlockTime.get() !== null,
      deltaTime,
    );

    if (
      (this.turnaroundConfNode.read() || this.outBlockTime.get() === null) &&
      !this.sci.parkBrakeSet.get() &&
      this.sci.doorsOpenPercentageOver100.get() < 0.25
    ) {
      if (this.turnaroundConfNode.read()) {
        // Turnaround: Reset block times
        this.offBlockTime.set(null);
        this.onBlockTime.set(null);
        this.inBlockTime.set(null);
      }
      this.outBlockFob.set(this.parkBrakeOffFob.get());
      this.outBlockTime.set(this.parkBrakeOffTime.get());
    }

    // Off Block: Not on ground for 10 seconds
    this.offBlockConfNode.write(this.outBlockTime.get() !== null && !this.sci.onGround.get(), deltaTime);
    if (this.offBlockTime.get() === null && this.outBlockTime.get() !== null && this.offBlockConfNode.read()) {
      this.offBlockFob.set(this.takeoffFob.get());
      this.offBlockTime.set(this.takeoffTime.get());
    }

    // On Block: On ground for 10 seconds and <30kts CAS
    this.onBlockConfNode.write(this.sci.onGround.get() && this.sci.airspeed.get().valueOr(0) < 30, deltaTime);
    if (this.onBlockTime.get() === null && this.offBlockTime.get() !== null && this.onBlockConfNode.read()) {
      this.onBlockFob.set(this.touchdownFob.get());
      this.onBlockTime.set(this.touchdownTime.get());
    }

    // In Block: Park brake set
    if (
      this.inBlockTime.get() === null &&
      this.onBlockTime.get() !== null &&
      this.sci.parkBrakeSet.get() &&
      this.sci.doorsOpenPercentageOver100.get() > 0.25 &&
      !this.sci.hydraulicsPressurized.get()
    ) {
      this.inBlockFob.set(this.parkBrakeOnFob.get());
      this.inBlockTime.set(this.parkBrakeOnTime.get());
    }

    // Flight & block time
    const outB = this.outBlockTime.get();
    const offB = this.offBlockTime.get();
    const onB = this.onBlockTime.get();
    const inB = this.inBlockTime.get();

    if (!outB) {
      this.flightTime.set(null);
      this.blockTime.set(null);
    } else {
      if (outB && !inB) {
        this.blockTime.set(this.sci.zuluTime.get() - outB);
      } else if (outB && inB) {
        this.blockTime.set(inB - outB);
      }

      if (offB && !onB) {
        this.flightTime.set(this.sci.zuluTime.get() - offB);
      } else if (offB && onB) {
        this.flightTime.set(onB - offB);
      }
    }
  }

  static months = OIS_MONTHS;

  static formatDateTime(t: number | null): string {
    return formatOisDateTime(t);
  }

  reset(): void {
    super.reset();
    this.pageDrafts.clear();
    this.oooiReports.clear();

    if (this.lastUpdateTime !== undefined) {
      this.lastUpdateTime = undefined;

      this.parkBrakeOffTime.set(null);
      this.parkBrakeOffFob.set(null);
      this.parkBrakeOnTime.set(null);
      this.parkBrakeOnFob.set(null);

      this.takeoffTime.set(null);
      this.takeoffFob.set(null);
      this.touchdownTime.set(null);
      this.touchdownFob.set(null);

      this.outBlockTime.set(null);
      this.offBlockTime.set(null);
      this.onBlockTime.set(null);
      this.inBlockTime.set(null);

      this.outBlockFob.set(null);
      this.offBlockFob.set(null);
      this.onBlockFob.set(null);
      this.inBlockFob.set(null);

      this.blockTime.set(null);
      this.flightTime.set(null);

      this.offBlockConfNode.write(false, 0);
      this.onBlockConfNode.write(false, 0);
      this.turnaroundConfNode.write(false, 0);
    }
  }
}
