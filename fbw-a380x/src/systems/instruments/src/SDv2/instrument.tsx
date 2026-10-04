import {
  FSComponent,
  HEventPublisher,
  InstrumentBackplane,
  FsInstrument,
  FsBaseInstrument,
  ClockPublisher,
} from '@microsoft/msfs-sdk';
import { ArincEventBus, FailuresConsumer, FmsDataPublisher } from '@flybywiresim/fbw-sdk';
import { SD } from './SD';
import { SDSimvarPublisher } from './SDSimvarPublisher';
import { AdirsValueProvider } from '../MsfsAvionicsCommon/AdirsValueProvider';
import { FcuEfisCpBusPublisher } from '@shared/publishers/EfisCpBusPublisher';
import { FqmsBusPublisher } from '@shared/publishers/FqmsBusPublisher';
import { CdsDisplay } from '@shared/CdsReconfiguration';
import { HostedDisplayGate, hostDisplayUnitOf } from '../MsfsAvionicsCommon/HostedDisplay';

class SdInstrument implements FsInstrument {
  private readonly bus = new ArincEventBus();

  private readonly backplane = new InstrumentBackplane();

  private readonly clockPublisher = new ClockPublisher(this.bus);

  private readonly hEventPublisher = new HEventPublisher(this.bus);

  private readonly simVarPublisher = new SDSimvarPublisher(this.bus);

  private readonly adirsValueProvider = new AdirsValueProvider(this.bus, this.simVarPublisher, 'L');

  private readonly fmsDataPublisher = new FmsDataPublisher(this.bus);

  private readonly fcuBusPublisher = new FcuEfisCpBusPublisher(this.bus);

  private readonly fqmsPublisher = new FqmsBusPublisher(this.bus);

  private readonly failuresConsumer = new FailuresConsumer();

  /** The DU this gauge draws on when it is the SD drawn on an ND DU (CDS reconfiguration, panel.cfg hostDu), else null */
  private readonly hostDisplayUnit = hostDisplayUnitOf('SDv2');

  /**
   * The run gate when this gauge is the SD drawn on an ND DU: it starts and runs only while the SD is shown there. Null
   * for the SD DU's own gauge.
   */
  private readonly hostedGate: HostedDisplayGate | null;

  constructor(public readonly instrument: BaseInstrument) {
    this.hEventPublisher = new HEventPublisher(this.bus);

    this.backplane.addPublisher('hEvent', this.hEventPublisher);
    this.backplane.addPublisher('clock', this.clockPublisher);
    this.backplane.addPublisher('sdSimVars', this.simVarPublisher);
    this.backplane.addPublisher('fmsData', this.fmsDataPublisher);
    this.backplane.addPublisher('fcuBus', this.fcuBusPublisher);
    this.backplane.addPublisher('fqms', this.fqmsPublisher);

    this.hostedGate =
      this.hostDisplayUnit === null
        ? null
        : new HostedDisplayGate(this.hostDisplayUnit, CdsDisplay.Sd, 'SDv2_CONTENT', () => this.doInit());
    if (this.hostedGate) {
      // hides the hosted gauge at once, starts it if the SD is already shown on its DU
      this.hostedGate.update();
    } else {
      this.doInit();
    }
  }

  /** Starts the SD: at once for the SD DU's own gauge, when first shown for a hosted gauge */
  public doInit(): void {
    this.backplane.init();

    this.adirsValueProvider.start();

    const sdv2 = document.getElementById('SDv2_CONTENT');

    FSComponent.render(
      <SD bus={this.bus} hostDisplayUnitId={this.hostDisplayUnit ?? undefined} />,
      document.getElementById('SDv2_CONTENT'),
    );

    // Remove "instrument didn't load" text
    sdv2?.querySelector(':scope > h1')?.remove();
  }

  /**
   * A callback called when the instrument gets a frame update.
   */
  public Update(): void {
    if (this.hostedGate && !this.hostedGate.update()) {
      return;
    }

    this.backplane.onUpdate();
    this.failuresConsumer.update();
  }

  public onInteractionEvent(args: string[]): void {
    if (this.hostedGate && !this.hostedGate.update()) {
      return;
    }

    this.hEventPublisher.dispatchHEvent(args[0]);
  }

  public onGameStateChanged(_oldState: GameState, _newState: GameState): void {
    // noop
  }

  public onFlightStart(): void {
    // noop
  }

  public onSoundEnd(_soundEventId: Name_Z): void {
    // noop
  }

  public onPowerOn(): void {
    // noop
  }

  public onPowerOff(): void {
    // noop
  }
}

class A380X_SDv2 extends FsBaseInstrument<SdInstrument> {
  public constructInstrument(): SdInstrument {
    return new SdInstrument(this);
  }

  public get isInteractive(): boolean {
    return true;
  }

  public get templateID(): string {
    return 'A380X_SDv2';
  }

  /** @inheritdoc */
  public onPowerOn(): void {
    super.onPowerOn();

    this.fsInstrument.onPowerOn();
  }

  /** @inheritdoc */
  public onShutDown(): void {
    super.onShutDown();

    this.fsInstrument.onPowerOff();
  }
}

registerInstrument('a380x-sdv2', A380X_SDv2);
