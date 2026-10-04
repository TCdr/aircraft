// @ts-strict-ignore
// Copyright (c) 2021-2023 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { Clock, EventBus, FSComponent, InstrumentBackplane, Subject } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { ExtendedClockEventProvider } from '../MsfsAvionicsCommon/providers/ExtendedClockProvider';
import { FuelSystemPublisher } from '../MsfsAvionicsCommon/providers/FuelSystemPublisher';
import { ArincValueProvider } from './shared/ArincValueProvider';
import { A32NXSfccBusPublisher } from '@shared/publishers/A32NXSfccBusPublisher';
import { EwdComponent } from './EWD';
import { EwdSimvarPublisher } from './shared/EwdSimvarPublisher';
import { UPPER_ECAM_DISPLAY_UNIT_FAILURE } from '../MsfsAvionicsCommon/displayUnitFailures';

import './style.scss';

class A32NX_EWD extends BaseInstrument {
  private readonly bus = new EventBus();

  private readonly backplane = new InstrumentBackplane();

  private readonly simVarPublisher = new EwdSimvarPublisher(this.bus);

  private readonly arincProvider = new ArincValueProvider(this.bus);

  private readonly clock = new Clock(this.bus);

  private readonly fuelSystemPublisher = new FuelSystemPublisher(this.bus);

  private readonly sfccBusPublisher = new A32NXSfccBusPublisher(this.bus);

  /** Receives the flyPad failures: the upper ECAM display unit failure blanks the E/WD. */
  private readonly failuresConsumer = new FailuresConsumer();

  private readonly displayFailed = Subject.create(false);

  constructor() {
    super();

    this.backplane.addInstrument('Clock', this.clock);
    // FIXME hook up DMC power state some day
    this.backplane.addInstrument('ExtClock', new ExtendedClockEventProvider(this.bus, Subject.create(true)));
    this.backplane.addPublisher('SimVars', this.simVarPublisher);
    this.backplane.addPublisher('FuelSystem', this.fuelSystemPublisher);

    this.backplane.addPublisher('SfccBus', this.sfccBusPublisher);

    this.failuresConsumer.register(UPPER_ECAM_DISPLAY_UNIT_FAILURE, (failed) => this.displayFailed.set(failed));
  }

  get templateID(): string {
    return 'A32NX_EWD';
  }

  public connectedCallback(): void {
    super.connectedCallback();

    this.arincProvider.init();
    this.backplane.init();

    FSComponent.render(
      <EwdComponent bus={this.bus} instrument={this} failed={this.displayFailed} />,
      document.getElementById('EWD_CONTENT'),
    );

    // Remove "instrument didn't load" text
    document.getElementById('EWD_CONTENT').querySelector(':scope > h1').remove();
  }

  public Update(): void {
    super.Update();

    this.backplane.onUpdate();
    this.failuresConsumer.update();
  }
}

registerInstrument('a32nx-ewd', A32NX_EWD);
