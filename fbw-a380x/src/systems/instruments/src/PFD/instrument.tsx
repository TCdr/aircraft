// @ts-strict-ignore
import { Clock, FSComponent, HEventPublisher, InstrumentBackplane, Subject } from '@microsoft/msfs-sdk';
import { ArincEventBus, EfisSide } from '@flybywiresim/fbw-sdk';
import { HostedDisplayGate, hostDisplayUnitOf } from '../MsfsAvionicsCommon/HostedDisplay';
import { CdsDisplay } from '@shared/CdsReconfiguration';
import { DmcPublisher } from '../MsfsAvionicsCommon/providers/DmcPublisher';
import { ExtendedClockEventProvider } from '../MsfsAvionicsCommon/providers/ExtendedClockProvider';
import { FmsDataPublisher } from '../MsfsAvionicsCommon/providers/FmsDataPublisher';
import { PFDComponent } from './PFD';
import { getDisplayIndex } from './shared/PfdDisplayIndex';
import { AdirsValueProvider } from './shared/AdirsValueProvider';
import { ArincValueProvider } from './shared/ArincValueProvider';
import { PFDSimvarPublisher } from './shared/PFDSimvarPublisher';
import { selectOnsideLandingSystemReceiver } from './shared/OnsideLandingSystemReceiver';
import { FcuEfisCpBusPublisher } from '@shared/publishers/EfisCpBusPublisher';
import {
  FwcPublisher,
  ReactiveWindshearPublisher,
  RopRowOansPublisher,
  SecPublisher,
  TawsPublisher,
} from '@flybywiresim/msfs-avionics-common';
import { FwsPfdSimvarPublisher } from '../MsfsAvionicsCommon/providers/FwsPfdPublisher';
import { FcdcBusPublisher } from '@shared/publishers/FcdcPublisher';
import { FcdcChoiceProvider } from './shared/FcdcChoiceProvider';
import { SfccSimVarPublisher } from '../MsfsAvionicsCommon/providers/SfccPublisher';
import { FGDataPublisher } from '../MsfsAvionicsCommon/providers/FGDataPublisher';
import { FqmsBusPublisher } from '@shared/publishers/FqmsBusPublisher';
import { PrimChoiceProvider } from '../../../shared/src/publishers/PrimChoiceProvider';
import { PrimFeBusPublisher } from '@shared/publishers/PrimFePublisher';
import { PrimFctlBusPublisher } from '@shared/publishers/PrimFctlPublisher';
import { PrimFgBusPublisher } from '@shared/publishers/PrimFgPublisher';
import { FdSelectionProvider } from './shared/FdSelectionProvider';

import './style.scss';

class A380X_PFD extends BaseInstrument {
  private readonly bus = new ArincEventBus();

  private readonly backplane = new InstrumentBackplane();

  private readonly clock = new Clock(this.bus);

  private readonly extendedClockProvider = new ExtendedClockEventProvider(this.bus, Subject.create(true));

  private readonly hEventPublisher = new HEventPublisher(this.bus);

  private readonly simVarPublisher = new PFDSimvarPublisher(this.bus);

  private readonly arincProvider = new ArincValueProvider(this.bus);

  private readonly adirsValueProvider = new AdirsValueProvider(this.bus, this.simVarPublisher);

  private readonly dmcPublisher = new DmcPublisher(this.bus);

  /**
   * The EFIS side whose FMS data this PFD reads (L:A32NX_EFIS_<side>_..., L:A32NX_FMGC_<side>_RNP): set in
   * connectedCallback, from the gauge's panel.cfg URL
   */
  private readonly fmsDataSide = Subject.create<EfisSide>('L');

  private readonly fmsDataPublisher = new FmsDataPublisher(this.bus, this.fmsDataSide);

  private readonly fwsPublisher = new FwcPublisher(this.bus);

  private readonly ropRowOansPublisher = new RopRowOansPublisher(this.bus);

  private readonly reactiveWindshearPublisher = new ReactiveWindshearPublisher(this.bus);

  private readonly secPublisher = new SecPublisher(this.bus);

  private readonly tawsPublisher = new TawsPublisher(this.bus);

  private readonly fwsPfdPublisher = new FwsPfdSimvarPublisher(this.bus);

  private readonly fcdcPublisher = new FcdcBusPublisher(this.bus);

  private readonly sfccPublisher = new SfccSimVarPublisher(this.bus);

  private readonly fgDataPublisher = new FGDataPublisher(this.bus);

  private readonly fqmsPublisher = new FqmsBusPublisher(this.bus);

  private readonly fcdcChoiceProvider = new FcdcChoiceProvider(this.bus);

  private readonly primChoiceProvider = new PrimChoiceProvider(this.bus);

  private readonly fdSelectionProvider = new FdSelectionProvider(this.bus);

  private readonly primFePublisher = new PrimFeBusPublisher(this.bus);

  private readonly primFctlPublisher = new PrimFctlBusPublisher(this.bus);

  private readonly primFgPublisher = new PrimFgBusPublisher(this.bus);

  private readonly efisCpBusPublisher = new FcuEfisCpBusPublisher(this.bus);

  /**
   * The run gate when this gauge is the PFD drawn on the ND DU (CDS reconfiguration, panel.cfg hostDu): it starts and
   * runs only while the PFD is shown there. Null for the PFD DU's own gauge. Made in connectedCallback, see there.
   */
  private hostedGate: HostedDisplayGate | null = null;

  constructor() {
    super();

    this.backplane.addInstrument('Clock', this.clock);
    this.backplane.addInstrument('ExtendedClock', this.extendedClockProvider);
    this.backplane.addPublisher('HEvent', this.hEventPublisher);
    this.backplane.addPublisher('PfdSimVars', this.simVarPublisher);
    this.backplane.addInstrument('ArincProvider', this.arincProvider);
    this.backplane.addInstrument('AdirsProvider', this.adirsValueProvider);
    this.backplane.addPublisher('DmcPublisher', this.dmcPublisher);
    this.backplane.addPublisher('FmsDataPublisher', this.fmsDataPublisher);
    this.backplane.addPublisher('FwsPublisher', this.fwsPublisher);
    this.backplane.addPublisher('RopRowOansPublisher', this.ropRowOansPublisher);
    this.backplane.addPublisher('ReactiveWindshearPublisher', this.reactiveWindshearPublisher);
    this.backplane.addPublisher('SecPublisher', this.secPublisher);
    this.backplane.addPublisher('TawsPublisher', this.tawsPublisher);
    this.backplane.addPublisher('FwsPfdPublisher', this.fwsPfdPublisher);
    this.backplane.addPublisher('FcdcPublisher', this.fcdcPublisher);
    this.backplane.addInstrument('FcdcChoiceProvider', this.fcdcChoiceProvider);
    this.backplane.addPublisher('SfccPublisher', this.sfccPublisher);
    this.backplane.addPublisher('FgDataPublisher', this.fgDataPublisher);
    this.backplane.addPublisher('FqmsPublisher', this.fqmsPublisher);
    this.backplane.addInstrument('FdSelectionProvider', this.fdSelectionProvider);
    this.backplane.addPublisher('PrimFePublisher', this.primFePublisher);
    this.backplane.addPublisher('PrimFctlPublisher', this.primFctlPublisher);
    this.backplane.addPublisher('PrimFgPublisher', this.primFgPublisher);

    this.backplane.addPublisher('EfisCpPublisher', this.efisCpBusPublisher);
  }

  get templateID(): string {
    return 'A380X_PFD';
  }

  public getDeltaTime() {
    return this.deltaTime;
  }

  public onInteractionEvent(args: string[]): void {
    this.hEventPublisher.dispatchHEvent(args[0]);
  }

  public connectedCallback(): void {
    super.connectedCallback();

    // The side of the PFD: 1 for the CAPT PFD (duID 0), 2 for the F/O PFD (duID 3), also when drawn on an ND DU. Known
    // only from here on (see below). The constructor read the duID digit itself (0 or 3, never 1) before the gauge had
    // its URL: both PFDs read the F/O side's FMS data.
    this.fmsDataSide.set(getDisplayIndex() === 1 ? 'L' : 'R');

    // Captain PFD displays ILS 1 (MMR 1), first officer PFD ILS 2 (MMR 2): FCOM DSC-34-10-20, a380_fcom.txt
    // l.86590-86591. Known only from here on, like the side above.
    selectOnsideLandingSystemReceiver(this.simVarPublisher, getDisplayIndex());

    // Whether this gauge is a hosted one comes from its panel.cfg URL, known only from here on: the sim creates the
    // gauge element (this constructor) before it gives it its url attribute and puts it into the panel. Read in the
    // constructor, the hosted PFD found no PFD gauge URL, took the ND's (no hostDu) and ran as the PFD DU's own gauge on
    // the ND DUs, never hidden.
    const hostDisplayUnit = hostDisplayUnitOf('PFD');
    this.hostedGate =
      hostDisplayUnit === null
        ? null
        : new HostedDisplayGate(hostDisplayUnit, CdsDisplay.Pfd, 'PFD_CONTENT', () => this.startInstrument());

    if (this.hostedGate) {
      this.hostedGate.update();
    } else {
      this.startInstrument();
    }
  }

  /** Starts the PFD: at once for the PFD DU's own gauge, when first shown for a hosted gauge */
  private startInstrument(): void {
    this.backplane.init();
    this.primChoiceProvider.init();

    FSComponent.render(<PFDComponent bus={this.bus} instrument={this} />, document.getElementById('PFD_CONTENT'));

    // Remove "instrument didn't load" text
    document.getElementById('PFD_CONTENT').querySelector(':scope > h1').remove();
  }

  /**
   * A callback called when the instrument gets a frame update.
   */
  public Update(): void {
    super.Update();

    if (this.hostedGate && !this.hostedGate.update()) {
      return;
    }

    this.backplane.onUpdate();
  }
}

registerInstrument('a380x-pfd', A380X_PFD);
