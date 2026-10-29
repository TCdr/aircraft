// Copyright (c) 2025 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  ClockEvents,
  ConsumerSubject,
  EventBus,
  Instrument,
  SimVarValueType,
  Subject,
  Subscribable,
  Subscription,
} from '@microsoft/msfs-sdk';
import {
  AircraftGithubVersionChecker,
  FailuresConsumer,
  FmsData,
  getSimBriefOfp,
  NXDataStore,
  NXUnits,
} from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import { FwsEvents } from '../MsfsAvionicsCommon/providers/FwsPublisher';
import { OitSimvars } from './OitSimvarPublisher';
import {
  aruStartDurationMs,
  AruStartup,
  isGatelinkAvailable,
  isGroundWirelessAvailable,
  isNssAvncsAvailable,
  LAPTOP_RESTART_OFF_MS,
  LaptopNetworkConnection,
  PowerCycleRecovery,
  sampleFrameStepMs,
} from './System/AnsuLogic';
import { OisMessageToolbar } from './System/OisMessageToolbar';
import { FltOpsPerformanceSession } from './System/Performance/FltOpsPerformanceSession';
import { A380_CERTIFIED_WEIGHTS } from './System/Performance/A380PerformanceCalculators';
import { OisLoadBox } from './System/OisLoadBox';
import { FlightFolderNetworkEvents, FlightFolderSession } from './System/FlightFolderSession';
import { OitPageDrafts } from './System/OitPageDrafts';
import { OisExportBox } from './System/OisExportBox';
import { InFltPerfAtmoSession } from './System/InFltPerfAtmoSession';
import {
  FltOpsLaptopIndex,
  FltOpsStatusFlight,
  FltOpsStatusNetworkEvents,
  FltOpsStatusSync,
  fmsDataReachLaptop,
  oisVersionLabel,
} from './System/FltOpsStatusSync';
import { OpsLibrarySession } from './System/OpsLibrary/OpsLibrarySession';
import { readLogbook } from './System/FltOpsLogbookReader';
import { TECH_LOGBOOK_STORAGE_KEY } from './System/TechLogbook';

export class OisLaptop implements Instrument {
  private readonly subscriptions: Subscription[] = [];

  /** @returns the self-test time of the flyPad realism page, read as the OIT loading screens do */
  private static selfTestTimeSetting(): number {
    return parseInt(NXDataStore.getLegacy('CONFIG_SELF_TEST_TIME', '12'));
  }

  public readonly data = new OisLaptopData();

  /** The data from the ground to load: the airline OFP (SimBrief). What the crew loads loads on the other laptop too. */
  public readonly loadBox = new OisLoadBox(
    () => getSimBriefOfp(),
    (items) =>
      items.forEach((item) =>
        this.networkPublisher.pub(
          'oisEffLoaded',
          { sender: this.index, identifier: item.identifier, generatedMs: item.generatedMs },
          true,
          false,
        ),
      ),
  );

  public readonly exportBox = new OisExportBox();

  private readonly failureKey = this.index === 1 ? A380Failure.CaptainLaptop : A380Failure.FirstOfficerLaptop;

  private readonly powered = Subject.create(false);

  private readonly _isHealthy = Subject.create(false);
  public readonly isHealthy = this._isHealthy as Subscribable<boolean>;
  private readonly isHealthySimVar = `L:A32NX_FLTOPS_LAPTOP_${this.index.toFixed(0)}_IS_HEALTHY`;

  private readonly sub = this.bus.getSubscriber<
    FmsData & FltOpsStatusNetworkEvents & FlightFolderNetworkEvents & OitSimvars & ClockEvents & FwsEvents
  >();

  private readonly simTime = ConsumerSubject.create(this.sub.on('simTime'), 0);

  private lastUpdateSimTime: number | null = null;

  /** The ARU, through which the laptop connects to the FLT OPS network */
  private readonly aru = new AruStartup(aruStartDurationMs(OisLaptop.selfTestTimeSetting()));

  private wasHealthy = false;

  private readonly networkConnection = new LaptopNetworkConnection();

  private readonly _standalone = Subject.create(false);
  /** The laptop operates as a stand-alone: STANDALONE on the Login page, SYNCHRONIZATION NOT AVAIL on the STS page */
  public readonly standalone = this._standalone as Subscribable<boolean>;

  /** The message toolbar of the FLT OPS menu bar, run by the laptop: it starts empty at each laptop start */
  public readonly messageToolbar = new OisMessageToolbar();

  /**
   * A company message notification pushed from the NSS AVNCS side. It reaches a running laptop connected to the FLT OPS
   * network only.
   * @param aocUid the AOC message id
   * @param subject its subject line
   */
  public receiveAocNotification(aocUid: number, subject: string): void {
    if (this._isHealthy.get() && !this._standalone.get()) {
      this.messageToolbar.postAocNotification(aocUid, subject);
    }
  }

  private readonly laptopSwitchedOn = ConsumerSubject.create(
    this.sub.on(this.index === 1 ? 'laptopCaptPowered' : 'laptopFoPowered'),
    false,
  );

  private readonly nssMasterOff = ConsumerSubject.create(this.sub.on('nssMasterOff'), false);

  private readonly gatelinkPbOff = ConsumerSubject.create(this.sub.on('nssGatelinkOff'), false);

  /** A restart of the laptop clears a failure */
  private readonly failureRecovery = new PowerCycleRecovery(LAPTOP_RESTART_OFF_MS);

  private readonly fltNumberBus = ConsumerSubject.create(this.sub.on('fmsFlightNumber'), null);
  private readonly fromAirportBus = ConsumerSubject.create(this.sub.on('fmsOrigin'), null);
  private readonly toAirportBus = ConsumerSubject.create(this.sub.on('fmsDestination'), null);

  private readonly nssAnsu1Healthy = ConsumerSubject.create(this.sub.on('nssAnsu1Healthy'), false);
  private readonly nssAnsu2Healthy = ConsumerSubject.create(this.sub.on('nssAnsu2Healthy'), false);

  /** The avionics data reach the FLT OPS side only through the NSS AVNCS side */
  private avionicsDataReachNss: Subscribable<boolean> = Subject.create(true);

  /**
   * @param available whether the avionics data reach the NSS AVNCS side
   */
  public connectAvionicsData(available: Subscribable<boolean>): void {
    this.avionicsDataReachNss = available;
  }

  private readonly networkPublisher = this.bus.getPublisher<FltOpsStatusNetworkEvents & FlightFolderNetworkEvents>();

  /** What the crew typed or selected on the pages of the open FLT OPS applications */
  public readonly pageDrafts = new OitPageDrafts();

  /** The electronic flight folders of this laptop, shared with the laptop of the other OIT (synced bus events) */
  public readonly flightFolder = new FlightFolderSession(
    this.index,
    {
      sendCurrent: (message) => this.networkPublisher.pub('oisEffCurrent', message, true, false),
      sendMaster: (message) => this.networkPublisher.pub('oisEffMaster', message, true, false),
      sendSynchronize: (message) => this.networkPublisher.pub('oisEffSynchronize', message, true, false),
    },
    () => NXUnits.metricWeight,
    (identifier, source, nowMs) => this.exportBox.add(identifier, source, nowMs),
  );

  /** The FLT OPS STS page, shared with the laptop of the other OIT (another instrument: synced bus events) */
  public readonly fltOpsStatus = new FltOpsStatusSync(this.index, this.data, {
    sendPage: (message) => this.networkPublisher.pub('oisFltOpsStsPage', message, true, false),
    requestPage: (sender) => this.networkPublisher.pub('oisFltOpsStsRequest', sender, true, false),
  });

  private opsLibrarySession: OpsLibrarySession | null = null;

  private cancelLogbookSubscription: (() => void) | null = null;

  /**
   * The OPS LIBRARY of this laptop, built when it is first used
   * @returns the OPS LIBRARY session
   */
  public get opsLibrary(): OpsLibrarySession {
    if (this.opsLibrarySession === null) {
      this.opsLibrarySession = new OpsLibrarySession(this.index, this.abnormalProcedures);
      const flightIndex = readLogbook()?.flight.index;
      if (flightIndex !== undefined) {
        this.opsLibrarySession.ecamAlerts.onFlightIndex(flightIndex);
      }
    }
    return this.opsLibrarySession;
  }

  /** The OIS VERSION line of the FLT OPS STS page */
  public readonly oisVersion = Subject.create('');

  public synchroAvionics() {
    const fms = this.fmsFlight();
    // Without the avionics data the STS page keeps its entries and the EFB overlay its flight plan
    if (fms === null) {
      return;
    }
    this.fltOpsStatus.synchroAvionics(fms);

    // The EFB overlay of the OIT reloads its flight plan on this L:var: synced bus events do not reach it, as it is in
    // the same VCockpit
    SimVar.SetSimVarValue('L:A32NX_OIS_SYNCHRO_AVIONICS', SimVarValueType.Number, Math.random());
  }

  /** EXIT SESSION: this laptop starts again for the next flight, and so does the FLT OPS STS page of the other one */
  public exitSession(): void {
    this.data.reset();
    this.opsLibrarySession?.reset();
    this.fltOpsStatus.exitSession();
  }

  /** @returns the FMS flight, null when the FMS data do not reach this laptop */
  private fmsFlight(): FltOpsStatusFlight | null {
    const connected = this._isHealthy.get() && !this._standalone.get();
    const nssAvncsAvailable = isNssAvncsAvailable(this.nssAnsu1Healthy.get(), this.nssAnsu2Healthy.get());
    if (!fmsDataReachLaptop(connected, nssAvncsAvailable, this.avionicsDataReachNss.get())) {
      return null;
    }
    return { fltNumber: this.fltNumberBus.get(), from: this.fromAirportBus.get(), to: this.toAirportBus.get() };
  }

  constructor(
    private readonly bus: EventBus,
    private readonly index: FltOpsLaptopIndex,
    private readonly failuresConsumer: FailuresConsumer,
    /** The abnormal procedures of the ECAM, which the OPS LIBRARY lists; given by the instrument */
    private readonly abnormalProcedures: Readonly<Record<string, { title: string }>> = {},
  ) {}

  /** @inheritdoc */
  init(): void {
    this.failuresConsumer.register(this.failureKey);

    this.subscriptions.push(
      this.sub.on('oisFltOpsStsPage').handle((message) => this.fltOpsStatus.receivePage(message)),
      this.sub.on('oisFltOpsStsRequest').handle((sender) => this.fltOpsStatus.receiveRequest(sender)),
      this.sub.on('oisEffLoaded').handle((message) => {
        if (message.sender !== this.index && this._isHealthy.get()) {
          // Not awaited: the item shows as loaded when the ground has answered
          this.loadBox.loadFromOffside(
            message.identifier,
            message.generatedMs,
            this.index === 1 ? 'CAPT' : 'FO',
            !this._standalone.get(),
          );
        }
      }),
      this.sub
        .on('oisEffCurrent')
        .handle((message) => this.onNetworkMessage(() => this.flightFolder.receiveCurrent(message))),
      this.sub
        .on('oisEffMaster')
        .handle((message) => this.onNetworkMessage(() => this.flightFolder.receiveMaster(message))),
      this.sub
        .on('oisEffSynchronize')
        .handle((message) => this.onNetworkMessage(() => this.flightFolder.receiveSynchronize(message))),
      this.loadBox.loaded.sub((items) => this.flightFolder.onLoaded(items)),
      this._isHealthy.sub((v) => SimVar.SetSimVarValue(this.isHealthySimVar, SimVarValueType.Bool, v)),
      this._isHealthy.sub((healthy) => {
        if (!healthy) {
          this.messageToolbar.clear();
          this.flightFolder.resetLaunch();
          this.opsLibrarySession?.reset();
        }
      }),
      this.sub.on('fws_abn_sensed_procedures').handle((procedures) => {
        // An alert has to be listed from its appearance, but a library that was never used has nothing to list while no
        // alert is active: it is not built before it is needed
        if (this.opsLibrarySession !== null || procedures.length > 0) {
          this.opsLibrary.ecamAlerts.update(procedures, this.simTime.get(), this.avionicsDataReachLaptop());
        }
      }),
    );

    // A flight closure in the eLogbook starts the next flight: the ECAM alerts of the OPS LIBRARY start again
    const trackFlightIndex = () => {
      const index = readLogbook()?.flight.index;
      if (index !== undefined && this.opsLibrarySession !== null) {
        this.opsLibrarySession.ecamAlerts.onFlightIndex(index);
      }
    };
    this.cancelLogbookSubscription = NXDataStore.subscribeLegacy(TECH_LOGBOOK_STORAGE_KEY, trackFlightIndex);

    this.subscriptions.push(
      this.gatelinkPbOff,
      this.fltNumberBus,
      this.fromAirportBus,
      this.toAirportBus,
      this.nssAnsu1Healthy,
      this.nssAnsu2Healthy,
      this.simTime,
    );

    AircraftGithubVersionChecker.getBuildInfo('a380x')
      .then((info) => this.oisVersion.set(oisVersionLabel(info)))
      .catch(() => this.oisVersion.set(''));
  }

  /**
   * A message of the other laptop reaches a running laptop only
   * @param take applies the message
   */
  private onNetworkMessage(take: () => void): void {
    if (this._isHealthy.get()) {
      take();
    }
  }

  /** @returns the simulation time, unix ms: what the time stamps of the FLT OPS laptop use */
  public simTimeMs(): number {
    return this.simTime.get();
  }

  /** @inheritdoc */
  onUpdate(): void {
    if (this.index === 1) {
      this.powered.set(
        SimVar.GetSimVarValue('L:A32NX_ELEC_DC_1_BUS_IS_POWERED', SimVarValueType.Bool) && this.laptopSwitchedOn.get(),
      );
    } else {
      this.powered.set(
        (SimVar.GetSimVarValue('L:A32NX_ELEC_DC_2_BUS_IS_POWERED', SimVarValueType.Bool) ||
          SimVar.GetSimVarValue('L:A32NX_ELEC_DC_HOT_2_BUS_IS_POWERED', SimVarValueType.Bool)) &&
          this.laptopSwitchedOn.get(),
      );
    }

    const now = this.simTime.get();
    const failed = this.failureRecovery.update(
      this.failuresConsumer.isActive(this.failureKey),
      this.powered.get(),
      now,
    );
    this._isHealthy.set(!failed && this.powered.get() && !this.nssMasterOff.get());
    if (this._isHealthy.get() && !this.wasHealthy) {
      // the setting may have changed in the session: a laptop start reads it again, as the loading screens do
      this.aru.setStartDurationMs(aruStartDurationMs(OisLaptop.selfTestTimeSetting()));
    }
    this.wasHealthy = this._isHealthy.get();

    const deltaTimeMs = sampleFrameStepMs(this.lastUpdateSimTime, now);
    this.lastUpdateSimTime = now;
    // the FLT OPS ANSU of this OIT instrument (AircraftNetworkServerUnit 'flt-ops')
    const fltOpsAnsuHealthy = SimVar.GetSimVarValue('L:A32NX_FLTOPS_ANSU_1_IS_HEALTHY', SimVarValueType.Bool) > 0;
    const aruOperating = this.aru.update(fltOpsAnsuHealthy, deltaTimeMs);
    this._standalone.set(
      this.networkConnection.update(this._isHealthy.get(), aruOperating, this.aru.isFlightLoading()),
    );
    // The network state of a laptop running at the flight load settles in the first seconds: an early flicker must
    // not count as a network loss, so the page starts once they are over
    const statusPageRunning = this._isHealthy.get() && !this.aru.isFlightLoading();
    this.fltOpsStatus.update(statusPageRunning, !this._standalone.get(), this.fmsFlight());

    this.opsLibrarySession?.update(now, this._isHealthy.get());
    this.opsLibrarySession?.avionicsAvailable.set(this.avionicsDataReachLaptop());

    // Design choice: every airport has a gatelink, so only the aircraft side (on the ground, the NSS GATELINK pb-sw on)
    // decides.
    this.exportBox.update(isGatelinkAvailable(this.isConnected(), this.isOnGround(), this.gatelinkPbOff.get()), now);
  }

  /** @returns whether the avionics data reach this laptop through the NSS AVNCS side */
  private avionicsDataReachLaptop(): boolean {
    const nssAvncsAvailable = isNssAvncsAvailable(this.nssAnsu1Healthy.get(), this.nssAnsu2Healthy.get());
    return fmsDataReachLaptop(this.isConnected(), nssAvncsAvailable, this.avionicsDataReachNss.get());
  }

  private isConnected(): boolean {
    return this._isHealthy.get() && !this._standalone.get();
  }

  private isOnGround(): boolean {
    return SimVar.GetSimVarValue('SIM ON GROUND', SimVarValueType.Bool) > 0;
  }

  /** @returns whether data from the ground (the LOAD BOX) can reach this laptop: gatelink on the ground, SATCOM in flight */
  public isGroundWirelessAvailable(): boolean {
    return isGroundWirelessAvailable(this.isConnected(), this.isOnGround(), this.gatelinkPbOff.get());
  }

  destroy() {
    this.cancelLogbookSubscription?.();
    this.cancelLogbookSubscription = null;
    for (const s of this.subscriptions) {
      s.destroy();
    }
  }
}

export class OisLaptopData {
  public readonly fltNumber = Subject.create<string | null>(null);
  public readonly fromAirport = Subject.create<string | null>(null);
  public readonly toAirport = Subject.create<string | null>(null);

  /** IN-FLT PERF ATMO */
  public readonly inFltPerf = new InFltPerfAtmoSession();

  /** T.O PERF, LDG PERF and LOADSHEET */
  public readonly performance = new FltOpsPerformanceSession(A380_CERTIFIED_WEIGHTS, () => NXUnits.metricWeight);

  /** EXIT SESSION: the laptop data start again for the next flight */
  public reset(): void {
    this.fltNumber.set(null);
    this.fromAirport.set(null);
    this.toAirport.set(null);
    this.inFltPerf.reset();
    this.performance.reset();
  }
}
