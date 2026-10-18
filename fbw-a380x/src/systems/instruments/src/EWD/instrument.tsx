// Copyright (c) 2021-2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import '../index.scss';
import './style.scss';

import { Clock, FSComponent, InstrumentBackplane } from '@microsoft/msfs-sdk';
import { ArincValueProvider } from './shared/ArincValueProvider';
import { EwdSimvarPublisher } from './shared/EwdSimvarPublisher';

import { EngineWarningDisplay } from './EWD';
import { AdrBusPublisher, ArincEventBus, IrBusPublisher } from '@flybywiresim/fbw-sdk';
import { FcdcBusPublisher } from '@shared/publishers/FcdcPublisher';
import { FGDataPublisher } from '../MsfsAvionicsCommon/providers/FGDataPublisher';
import { HostedDisplayGate, hostDisplayUnitOf } from '../MsfsAvionicsCommon/HostedDisplay';
import { CdsDisplay } from '@shared/CdsReconfiguration';
import { CpiomDataPublisher } from '@providers/CpiomPublisher';

class A380X_EWD extends BaseInstrument {
  private readonly bus = new ArincEventBus();

  private readonly backplane = new InstrumentBackplane();

  private readonly simVarPublisher = new EwdSimvarPublisher(this.bus);

  private readonly cpiomPublisher = new CpiomDataPublisher(this.bus);

  private readonly fcdcPublisher = new FcdcBusPublisher(this.bus);

  private readonly arincProvider = new ArincValueProvider(this.bus);

  private readonly adrPublisher = new AdrBusPublisher(this.bus);
  private readonly irPublisher = new IrBusPublisher(this.bus);

  private readonly fgPublisher = new FGDataPublisher(this.bus);

  private readonly clock = new Clock(this.bus);

  /**
   * The run gate when this gauge is the EWD drawn on the SD DU or an ND DU (CDS reconfiguration, panel.cfg hostDu): it
   * starts and runs only while the EWD is shown there. Null for the EWD DU's own gauge. Made in connectedCallback.
   */
  private hostedGate: HostedDisplayGate | null = null;

  constructor() {
    super();

    this.backplane.addInstrument('Clock', this.clock);
    this.backplane.addPublisher('SimVars', this.simVarPublisher);
    this.backplane.addPublisher('CPIOM', this.cpiomPublisher);
    this.backplane.addPublisher('FCDC', this.fcdcPublisher);
    this.backplane.addPublisher('ADR', this.adrPublisher);
    this.backplane.addPublisher('IR', this.irPublisher);
    this.backplane.addPublisher('FG', this.fgPublisher);
  }

  get templateID(): string {
    return 'A380X_EWD';
  }

  public get isInteractive(): boolean {
    return true;
  }

  public connectedCallback(): void {
    super.connectedCallback();

    // Whether this gauge is a hosted one comes from its panel.cfg URL, known only from here on: the sim creates the
    // gauge element (this constructor) before it gives it its url attribute and puts it into the panel. Read too early,
    // the hosted EWD would take the SD's URL (no hostDu) and run, never hidden, as the EWD DU's own gauge.
    const hostDisplayUnit = hostDisplayUnitOf('EWD');
    this.hostedGate =
      hostDisplayUnit === null
        ? null
        : new HostedDisplayGate(hostDisplayUnit, CdsDisplay.Ewd, 'EWD_CONTENT', () => this.startInstrument());

    if (this.hostedGate) {
      this.hostedGate.update();
    } else {
      this.startInstrument();
    }
  }

  /** Starts the EWD: at once for the EWD DU's own gauge, when first shown for a hosted gauge */
  private startInstrument(): void {
    this.arincProvider.init();
    this.backplane.init();

    FSComponent.render(<EngineWarningDisplay bus={this.bus} />, document.getElementById('EWD_CONTENT'));

    // Remove "instrument didn't load" text
    document.getElementById('EWD_CONTENT')?.querySelector(':scope > h1')?.remove();
  }

  public Update(): void {
    super.Update();

    if (this.hostedGate && !this.hostedGate.update()) {
      return;
    }

    this.backplane.onUpdate();
  }
}

registerInstrument('a380x-ewd', A380X_EWD);
