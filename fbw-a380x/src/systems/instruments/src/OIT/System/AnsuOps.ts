// Copyright (c) 2025 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ConsumerSubject, EventBus, Subject, Subscribable, Subscription } from '@microsoft/msfs-sdk';
import { AircraftNetworkServerUnit } from './AircraftNetworkServerUnit';
import { FailuresConsumer, NXDataStore, NXLogicConfirmNode, UpdateThrottler } from '@flybywiresim/fbw-sdk';
import { CompanyComMailbox } from './CompanyComMailbox';
import { CompanyComRequests } from './CompanyComRequests';
import { CompanyComDownlinks } from './CompanyComDownlinks';
import { CompanyComReports } from './CompanyComReports';
import { OisMessageToolbar } from './OisMessageToolbar';
import { TechLogbookStore } from './TechLogbookStore';
import { formatOisDateTime, OIS_MONTHS } from './OisDateTime';
import { OitPageDrafts } from './OitPageDrafts';
import { linkDegradedToolbarText } from './NssAvionicsLink';
import { AnsuIndex, AnsuType, isNssAvncsAvailable } from './AnsuLogic';
import { OitSimvars } from '../OitSimvarPublisher';
import { OooiEvent, OooiReports } from './OooiReports';
import { ReportWeightUnit } from './CompanyComReportForms';

export class AnsuOps extends AircraftNetworkServerUnit {
  private lastUpdateTime: number | undefined = undefined;
  private startStateRecorded = false;
  /** Whether the applications had lost their data at the previous update, so that it is cleared once */
  private nssAvncsDataWasLost = false;

  /** The health of the other NSS AVNCS ANSU, which keeps the applications running when this one fails */
  private readonly ansu2Healthy = ConsumerSubject.create(
    this.bus.getSubscriber<OitSimvars>().on('nssAnsu2Healthy'),
    false,
  );
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

  /**
   * @param bus the bus of the OIT
   * @param index the ANSU number
   * @param type the ANSU type
   * @param failuresConsumer the failures
   * @param generatesOooiReports whether this OIT sends the OOOI reports to the AOC. The AOC is one for both OITs, so
   * only one of them sends: the other keeps the times for its display
   * @param routerOperating whether the Aircraft Router Unit of this ANSU operates, null without a router
   */
  constructor(
    bus: EventBus,
    index: AnsuIndex,
    type: AnsuType,
    failuresConsumer: FailuresConsumer,
    private readonly generatesOooiReports: boolean = true,
    routerOperating: Subscribable<boolean> | null = null,
  ) {
    super(bus, index, type, failuresConsumer, routerOperating);
  }

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
      this.ansu2Healthy,
      this.sci.link.sub((link) => {
        const text = linkDegradedToolbarText(link);
        if (text !== null) {
          this.messageToolbar.post(text);
        }
      }),
      this.sci.parkBrakeSet.sub((set) => this.recordParkBrake(set)),
      this.sci.onGround.sub((onGround) => this.recordGround(onGround)),
    );
    if (this.generatesOooiReports) {
      this.subscriptions.push(
        this.reportOnSet('OUT', this.outBlockTime, this.outBlockFob),
        this.reportOnSet('OFF', this.offBlockTime, this.offBlockFob),
        this.reportOnSet('ON', this.onBlockTime, this.onBlockFob),
        this.reportOnSet('IN', this.inBlockTime, this.inBlockFob),
      );
    }
  }

  /**
   * Records the time and the fuel on board of a park brake change
   * @param set whether the park brake is set now
   */
  private recordParkBrake(set: boolean): void {
    // Before the first update the values are the defaults of the data link, not changes of the aircraft
    if (!this.startStateRecorded) {
      return;
    }
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
    if (!this.startStateRecorded) {
      return;
    }
    if (onGround) {
      this.touchdownTime.set(this.sci.zuluTime.get());
      this.touchdownFob.set(this.sci.fqmsFuelQuantity.get().valueOr(null));
    } else {
      this.takeoffTime.set(this.sci.zuluTime.get());
      this.takeoffFob.set(this.sci.fqmsFuelQuantity.get().valueOr(null));
    }
  }

  /**
   * Starts the recording of the ground and park brake changes at the first update, not at init: the sim clock and the
   * avionics data have not arrived by then, the time would be the one of the PC and the fuel unknown. A park brake that
   * is off or an aircraft that is airborne at the load records no OOOI event, as it did not leave a block or the
   * ground; a transition after the first update does.
   */
  private recordStartState(): void {
    this.startStateRecorded = true;
    // A brake that is off at the start is no release: the aircraft did not leave a block, so there is no OUT
    if (this.sci.parkBrakeSet.get()) {
      this.recordParkBrake(true);
    }
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

  /** The applications run on ANSU 2 while ANSU 1 is out, so ANSU 1 alone does not clear them */
  protected onBecameUnhealthy(): void {}

  /** @inheritdoc */
  onUpdate(): boolean {
    const healthy = super.onUpdate();
    const available = isNssAvncsAvailable(healthy, this.ansu2Healthy.get());
    // A lost router only cuts this ANSU off from the users of the applications: its data survives until the ANSU stops
    const dataLost = !available && !this.operational;
    if (dataLost && !this.nssAvncsDataWasLost) {
      this.reset();
    }
    this.nssAvncsDataWasLost = dataLost;
    if (!available) {
      return false;
    }
    if (!this.startStateRecorded) {
      this.recordStartState();
    }
    const _deltaTime = this.lastUpdateTime === undefined ? 1_000 : this.sci.zuluTime.get() - this.lastUpdateTime;
    this.lastUpdateTime = this.sci.zuluTime.get();

    const deltaTime = this.ansuUpdateThrottler.canUpdate(_deltaTime);

    // Enforce cycle time for the logic computation (otherwise pulse nodes would be broken)
    if (deltaTime === -1 || _deltaTime === 0) {
      return true;
    }

    this.updateOooiTimes(deltaTime);
    this.techLogbook.update(this.sci.zuluTime.get());
    return true;
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
      this.startStateRecorded = false;

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
