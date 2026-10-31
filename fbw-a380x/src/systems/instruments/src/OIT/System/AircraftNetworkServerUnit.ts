// Copyright (c) 2025 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  ClockEvents,
  ConsumerSubject,
  EventBus,
  Instrument,
  SimVarValueType,
  Subject,
  Subscription,
} from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import { ResetPanelSimvars } from '../../MsfsAvionicsCommon/providers/ResetPanelPublisher';
import { OitSimvars } from '../OitSimvarPublisher';
import { SecureCommunicationInterface } from './SecureCommunicationInterface';
import { AnsuIndex, AnsuType, isAnsuAcSupplied, isAnsuPowered, NssAutoShutdown } from './AnsuLogic';

export class AircraftNetworkServerUnit implements Instrument {
  //TODO ANSU should be under systems host and split between flt-opts and nss-avncs?
  protected readonly subscriptions: Subscription[] = [];

  protected readonly sub = this.bus.getSubscriber<ResetPanelSimvars & OitSimvars & ClockEvents>();

  protected readonly failureKey =
    this.type === 'flt-ops' && this.index === 1
      ? A380Failure.FltOpsAnsu
      : this.index === 1
        ? A380Failure.NssAnsu1
        : A380Failure.NssAnsu2;

  protected readonly powered = Subject.create(false);

  protected readonly _isHealthy = Subject.create(false);
  protected readonly isHealthySimVar = `L:A32NX_${this.type === 'nss-avncs' ? 'NSS' : 'FLTOPS'}_ANSU_${this.index.toFixed(0)}_IS_HEALTHY`;

  protected readonly simTime = ConsumerSubject.create(this.sub.on('simTime'), 0);

  protected readonly nssMasterOff = ConsumerSubject.create(this.sub.on('nssMasterOff'), false);

  protected readonly resetPbStatus = ConsumerSubject.create(
    this.sub.on(this.type === 'flt-ops' ? 'a380x_reset_panel_nss_flt_ops' : 'a380x_reset_panel_nss_avncs'),
    false,
  );

  /** Whether the unit was healthy at the previous update, so that the reset runs once per failure, not every frame */
  private wasHealthy = true;

  /** The NSS stops by itself when the aircraft is powered down */
  protected readonly autoShutdown = new NssAutoShutdown();

  public readonly sci = new SecureCommunicationInterface(this.bus, this.failuresConsumer);

  constructor(
    protected readonly bus: EventBus,
    protected readonly index: AnsuIndex, // NSS AVNCS: ANSU 1 and 2, FLT OPS: one ANSU (index 1)
    protected readonly type: AnsuType,
    protected readonly failuresConsumer: FailuresConsumer,
  ) {}

  /** @inheritdoc */
  init(): void {
    this.failuresConsumer.register(this.failureKey);
    this.sci.init();

    this.subscriptions.push(
      this.simTime,
      this._isHealthy.sub((v) => SimVar.SetSimVarValue(this.isHealthySimVar, SimVarValueType.Bool, v), true),
    );
  }

  /**
   * @inheritdoc
   * @returns whether the unit is healthy; false when the update stopped after the data link
   */
  onUpdate(): boolean {
    const failed = this.failuresConsumer.isActive(this.failureKey);
    this.sci.onUpdate();

    // The A380 busbar names come from the A320: AC_ESS_SHED is the A380 AC ESS (400XP), AC_ESS the AC EMER (491XP)
    const supplies = {
      ac1: SimVar.GetSimVarValue('L:A32NX_ELEC_AC_1_BUS_IS_POWERED', SimVarValueType.Bool) > 0,
      ac2: SimVar.GetSimVarValue('L:A32NX_ELEC_AC_2_BUS_IS_POWERED', SimVarValueType.Bool) > 0,
      acEss: SimVar.GetSimVarValue('L:A32NX_ELEC_AC_ESS_SHED_BUS_IS_POWERED', SimVarValueType.Bool) > 0,
      acEmer: SimVar.GetSimVarValue('L:A32NX_ELEC_AC_ESS_BUS_IS_POWERED', SimVarValueType.Bool) > 0,
      dcHot1: SimVar.GetSimVarValue('L:A32NX_ELEC_DC_HOT_1_BUS_IS_POWERED', SimVarValueType.Bool) > 0,
      dcHot2: SimVar.GetSimVarValue('L:A32NX_ELEC_DC_HOT_2_BUS_IS_POWERED', SimVarValueType.Bool) > 0,
    };
    const shutDown = this.autoShutdown.update(isAnsuAcSupplied(this.type, this.index, supplies), this.simTime.get());

    this.powered.set(!shutDown && isAnsuPowered(this.type, this.index, supplies));

    this._isHealthy.set(!failed && this.powered.get() && !this.resetPbStatus.get() && !this.nssMasterOff.get());

    const healthy = this._isHealthy.get();
    if (!healthy && this.wasHealthy) {
      this.onBecameUnhealthy();
    }
    this.wasHealthy = healthy;
    return healthy;
  }

  /** The unit just stopped working: by default it loses its data */
  protected onBecameUnhealthy(): void {
    this.reset();
  }

  reset(): void {
    // Called when reset panel p/b is pulled out
  }

  destroy() {
    for (const s of this.subscriptions) {
      s.destroy();
    }
    this.sci.destroy();
  }
}
