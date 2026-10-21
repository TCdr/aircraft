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
  NXUnits,
} from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import { OitSimvars } from './OitSimvarPublisher';
import { AruStartup, isNssAvncsAvailable, LaptopNetworkConnection } from './System/AnsuLogic';
import { OisMessageToolbar } from './System/OisMessageToolbar';
import { FltOpsPerformanceSession } from './System/Performance/FltOpsPerformanceSession';
import { A380_CERTIFIED_WEIGHTS } from './System/Performance/A380PerformanceCalculators';
import { effExportIdentifier, OisLoadBox } from './System/OisLoadBox';
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

export class OisLaptop implements Instrument {
  private readonly subscriptions: Subscription[] = [];

  public readonly data = new OisLaptopData();

  /** The data from the ground to load: the airline OFP (SimBrief) */
  public readonly loadBox = new OisLoadBox(() => getSimBriefOfp());

  public readonly exportBox = new OisExportBox();

  private readonly failureKey = this.index === 1 ? A380Failure.CaptainLaptop : A380Failure.FirstOfficerLaptop;

  private readonly powered = Subject.create(false);

  private readonly _isHealthy = Subject.create(false);
  public readonly isHealthy = this._isHealthy as Subscribable<boolean>;
  private readonly isHealthySimVar = `L:A32NX_FLTOPS_LAPTOP_${this.index.toFixed(0)}_IS_HEALTHY`;

  private readonly sub = this.bus.getSubscriber<FmsData & FltOpsStatusNetworkEvents & OitSimvars & ClockEvents>();

  private readonly simTime = ConsumerSubject.create(this.sub.on('simTime'), 0);

  private lastUpdateSimTime: number | null = null;

  /** The ARU, through which the laptop connects to the FLT OPS network */
  private readonly aru = new AruStartup();

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

  private readonly fltNumberBus = ConsumerSubject.create(this.sub.on('fmsFlightNumber'), null);
  private readonly fromAirportBus = ConsumerSubject.create(this.sub.on('fmsOrigin'), null);
  private readonly toAirportBus = ConsumerSubject.create(this.sub.on('fmsDestination'), null);

  private readonly nssAnsu1Healthy = ConsumerSubject.create(this.sub.on('nssAnsu1Healthy'), false);
  private readonly nssAnsu2Healthy = ConsumerSubject.create(this.sub.on('nssAnsu2Healthy'), false);

  private readonly networkPublisher = this.bus.getPublisher<FltOpsStatusNetworkEvents>();

  /** The FLT OPS STS page, shared with the laptop of the other OIT (another instrument: synced bus events) */
  public readonly fltOpsStatus = new FltOpsStatusSync(this.index, this.data, {
    sendPage: (message) => this.networkPublisher.pub('oisFltOpsStsPage', message, true, false),
    requestPage: (sender) => this.networkPublisher.pub('oisFltOpsStsRequest', sender, true, false),
  });

  /** The OIS VERSION line of the FLT OPS STS page */
  public readonly oisVersion = Subject.create('');

  public synchroAvionics() {
    this.fltOpsStatus.synchroAvionics(this.fmsFlight());

    // The EFB overlay of the OIT reloads its flight plan on this L:var: synced bus events do not reach it, as it is in
    // the same VCockpit
    SimVar.SetSimVarValue('L:A32NX_OIS_SYNCHRO_AVIONICS', SimVarValueType.Number, Math.random());
  }

  /** EXIT SESSION: this laptop starts again for the next flight, and so does the FLT OPS STS page of the other one */
  public exitSession(): void {
    this.data.reset();
    this.fltOpsStatus.exitSession();
  }

  /** @returns the FMS flight, null when the FMS data do not reach this laptop */
  private fmsFlight(): FltOpsStatusFlight | null {
    const connected = this._isHealthy.get() && !this._standalone.get();
    const nssAvncsAvailable = isNssAvncsAvailable(this.nssAnsu1Healthy.get(), this.nssAnsu2Healthy.get());
    const anySciWorking =
      !this.failuresConsumer.isActive(A380Failure.Sci1) || !this.failuresConsumer.isActive(A380Failure.Sci2);
    if (!fmsDataReachLaptop(connected, nssAvncsAvailable, anySciWorking)) {
      return null;
    }
    return { fltNumber: this.fltNumberBus.get(), from: this.fromAirportBus.get(), to: this.toAirportBus.get() };
  }

  constructor(
    private readonly bus: EventBus,
    private readonly index: FltOpsLaptopIndex,
    private readonly failuresConsumer: FailuresConsumer,
  ) {}

  /** @inheritdoc */
  init(): void {
    this.failuresConsumer.register(this.failureKey);

    this.subscriptions.push(
      this.sub.on('oisFltOpsStsPage').handle((message) => this.fltOpsStatus.receivePage(message)),
      this.sub.on('oisFltOpsStsRequest').handle((sender) => this.fltOpsStatus.receiveRequest(sender)),
      this._isHealthy.sub((v) => SimVar.SetSimVarValue(this.isHealthySimVar, SimVarValueType.Bool, v)),
      this._isHealthy.sub((healthy) => {
        if (!healthy) {
          this.messageToolbar.clear();
        }
      }),
    );

    this.subscriptions.push(
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

    // The FLT FOLDER of the OIT is the flyPad, without its EXPORT FLIGHT FOLDER function: an EFF loaded into the
    // laptop enters the EXPORT BOX as its before push back export.
    this.subscriptions.push(
      this.loadBox.loadedEff.sub((eff) => {
        if (eff !== null) {
          this.exportBox.add(effExportIdentifier(eff), 'FLT FOLDER', this.simTime.get());
        }
      }),
    );
  }

  /** @inheritdoc */
  onUpdate(): void {
    const failed = this.failuresConsumer.isActive(this.failureKey);

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

    this._isHealthy.set(!failed && this.powered.get() && !this.nssMasterOff.get());

    const now = this.simTime.get();
    const deltaTimeMs = this.lastUpdateSimTime === null ? 0 : now - this.lastUpdateSimTime;
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

    // Design choice: every airport has a gatelink, reached on the ground through the network.
    const gatelinkAvailable =
      this._isHealthy.get() &&
      !this._standalone.get() &&
      SimVar.GetSimVarValue('SIM ON GROUND', SimVarValueType.Bool) > 0;
    this.exportBox.update(gatelinkAvailable, now);
  }

  destroy() {
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
