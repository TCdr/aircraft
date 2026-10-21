// Copyright (c) 2025 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  ClockEvents,
  ConsumerSubject,
  EventBus,
  Instrument,
  MappedSubject,
  Subject,
  Subscribable,
  Subscription,
} from '@microsoft/msfs-sdk';
import {
  AdrBusEvents,
  Arinc429LocalVarConsumerSubject,
  FailuresConsumer,
  FmsData,
  FwcBusEvents,
} from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import { ResetPanelSimvars } from '../../MsfsAvionicsCommon/providers/ResetPanelPublisher';
import { FqmsBusEvents } from '@shared/publishers/FqmsBusPublisher';
import { OitSimvars } from '../OitSimvarPublisher';
import { canReceiveFromAvionics, canSendToAvionics, NssAvionicsLink, nssAvionicsLink } from './NssAvionicsLink';

export class SecureCommunicationInterface implements Instrument {
  private readonly subscriptions: Subscription[] = [];

  /** Paused while no avionics data reaches the NSS: the NSS applications keep the last values they received */
  private readonly fromAircraftSubscriptions: Subscription[] = [];

  private readonly sub = this.bus.getSubscriber<
    ResetPanelSimvars & OitSimvars & FmsData & AdrBusEvents & FwcBusEvents & ClockEvents & FqmsBusEvents
  >();

  private readonly nssDataToAvncsOff = ConsumerSubject.create(this.sub.on('nssDataToAvncsOff'), false);

  private readonly sciFailed = [Subject.create(false), Subject.create(false)];

  private readonly _link = MappedSubject.create(
    ([pbOff, sci1Failed, sci2Failed]) => nssAvionicsLink(pbOff, [sci1Failed, sci2Failed]),
    this.nssDataToAvncsOff,
    this.sciFailed[0],
    this.sciFailed[1],
  );
  /** The data link between the NSS AVNCS side and the avionics */
  public readonly link = this._link as Subscribable<NssAvionicsLink>;

  /** The NSS applications can send to the avionics, and so to the ground */
  public readonly canSendToAvionics = this._link.map(canSendToAvionics);

  /** The avionics data reaches the NSS */
  public readonly canReceiveFromAvionics = this._link.map(canReceiveFromAvionics);

  // Data from avionics
  public readonly zuluTime = ConsumerSubject.create(this.sub.on('simTime'), Date.now());

  public readonly fltNumber = ConsumerSubject.create(this.sub.on('fmsFlightNumber'), null);
  public readonly fltOrigin = ConsumerSubject.create(this.sub.on('fmsOrigin'), null);
  public readonly fltDestination = ConsumerSubject.create(this.sub.on('fmsDestination'), null);

  public readonly parkBrakeSet = ConsumerSubject.create(this.sub.on('parkBrakeSet'), false);

  public readonly airspeed = Arinc429LocalVarConsumerSubject.create(this.sub.on('adr_computed_airspeed_1'));

  public readonly fwcDiscreteWord126 = Arinc429LocalVarConsumerSubject.create(
    this.sub.on('a32nx_fwc_discrete_word_126_1'),
  );

  public readonly onGround = this.fwcDiscreteWord126.map((dw) => dw.bitValueOr(28, true));

  public readonly doorsOpenPercentageOver100 = ConsumerSubject.create(this.sub.on('cabinDoorOpen'), 0);

  public readonly fqmsFuelQuantity = Arinc429LocalVarConsumerSubject.create(this.sub.on('fqms_total_fuel_on_board'));

  public readonly hydGreenPressurized = ConsumerSubject.create(this.sub.on('hydGreenPressurized'), false);
  public readonly hydYellowPressurized = ConsumerSubject.create(this.sub.on('hydYellowPressurized'), false);
  public readonly hydraulicsPressurized = MappedSubject.create(
    ([green, yellow]) => green || yellow,
    this.hydGreenPressurized,
    this.hydYellowPressurized,
  );

  constructor(
    private readonly bus: EventBus,
    private readonly failuresConsumer: FailuresConsumer,
  ) {}

  /** @inheritdoc */
  init(): void {
    this.subscriptions.push(
      this.nssDataToAvncsOff,
      this.zuluTime,
      this._link,
      this.canSendToAvionics,
      this.canReceiveFromAvionics,
    );

    this.fromAircraftSubscriptions.push(
      this.fltNumber,
      this.fltOrigin,
      this.fltDestination,
      this.parkBrakeSet,
      this.airspeed,
      this.fwcDiscreteWord126,
      this.onGround,
      this.doorsOpenPercentageOver100,
      this.fqmsFuelQuantity,
      this.hydGreenPressurized,
      this.hydYellowPressurized,
      this.hydraulicsPressurized,
    );

    this.subscriptions.push(
      this.canReceiveFromAvionics.sub((receiving) =>
        this.fromAircraftSubscriptions.forEach((s) => (receiving ? s.resume() : s.pause())),
      ),
    );
  }

  /** @inheritdoc */
  onUpdate(): void {
    this.sciFailed[0].set(this.failuresConsumer.isActive(A380Failure.Sci1));
    this.sciFailed[1].set(this.failuresConsumer.isActive(A380Failure.Sci2));
  }

  destroy() {
    for (const s of this.subscriptions) {
      s.destroy();
    }

    for (const s of this.fromAircraftSubscriptions) {
      s.destroy();
    }
  }
}
