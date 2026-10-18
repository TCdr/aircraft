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
import { FailuresConsumer, FmsData } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import { OisInternalData } from './OisInternalPublisher';
import { OitSimvars } from './OitSimvarPublisher';
import { AruStartup, LaptopNetworkConnection } from './System/AnsuLogic';

type LaptopIndex = 1 | 2;

export class OisLaptop implements Instrument {
  private readonly subscriptions: Subscription[] = [];

  public readonly data = new OisLaptopData();

  private readonly failureKey = this.index === 1 ? A380Failure.CaptainLaptop : A380Failure.FirstOfficerLaptop;

  private readonly powered = Subject.create(false);

  private readonly _isHealthy = Subject.create(false);
  public readonly isHealthy = this._isHealthy as Subscribable<boolean>;
  private readonly isHealthySimVar = `L:A32NX_FLTOPS_LAPTOP_${this.index.toFixed(0)}_IS_HEALTHY`;

  private readonly sub = this.bus.getSubscriber<FmsData & OisInternalData & OitSimvars & ClockEvents>();

  private readonly simTime = ConsumerSubject.create(this.sub.on('simTime'), 0);

  private lastUpdateSimTime: number | null = null;

  /** The ARU, through which the laptop connects to the FLT OPS network (A380 FCOM DSC-46-20-10-20, DSC-46-20-40) */
  private readonly aru = new AruStartup();

  private readonly networkConnection = new LaptopNetworkConnection();

  private readonly _standalone = Subject.create(false);
  /** The laptop operates as a stand-alone: STANDALONE on the Login page, SYNCHRONIZATION NOT AVAIL on the STS page */
  public readonly standalone = this._standalone as Subscribable<boolean>;

  private readonly laptopSwitchedOn = ConsumerSubject.create(
    this.sub.on(this.index === 1 ? 'laptopCaptPowered' : 'laptopFoPowered'),
    false,
  );

  private readonly nssMasterOff = ConsumerSubject.create(this.sub.on('nssMasterOff'), false);

  private readonly fltNumberBus = ConsumerSubject.create(this.sub.on('fmsFlightNumber'), null);
  private readonly fromAirportBus = ConsumerSubject.create(this.sub.on('fmsOrigin'), null);
  private readonly toAirportBus = ConsumerSubject.create(this.sub.on('fmsDestination'), null);

  public synchroAvionics() {
    this.data.fltNumber.set(this.fltNumberBus.get());
    this.data.fromAirport.set(this.fromAirportBus.get());
    this.data.toAirport.set(this.toAirportBus.get());

    // Workaround since synced messages in the same VCockpit don't work
    SimVar.SetSimVarValue('L:A32NX_OIS_SYNCHRO_AVIONICS', SimVarValueType.Number, Math.random());
  }

  constructor(
    private readonly bus: EventBus,
    private readonly index: LaptopIndex,
    private readonly failuresConsumer: FailuresConsumer,
  ) {}

  /** @inheritdoc */
  init(): void {
    this.failuresConsumer.register(this.failureKey);

    this.subscriptions.push(
      this.sub.on('synchroAvncs').handle(() => this.synchroAvionics()),
      this._isHealthy.sub((v) => SimVar.SetSimVarValue(this.isHealthySimVar, SimVarValueType.Bool, v)),
    );

    this.subscriptions.push(this.fltNumberBus, this.fromAirportBus, this.toAirportBus, this.simTime);
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

  /** The FLT OPS STS page data of a new session: nothing entered (EXIT SESSION, OitUiService.exitFltOpsSession) */
  public reset(): void {
    this.fltNumber.set(null);
    this.fromAirport.set(null);
    this.toAirport.set(null);
  }
}
