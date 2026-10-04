import {
  ConsumerSubject,
  EventBus,
  GameStateProvider,
  Instrument,
  SimVarValueType,
  Subject,
  Subscribable,
  Wait,
} from '@microsoft/msfs-sdk';
import { MfdSurvEvents } from '../../../instruments/src/MsfsAvionicsCommon/providers/MfdSurvPublisher';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import { isTcasInoperative, isTransponderOperative, selectedSurvSystem } from './TransponderSystem';

// FIXME implement the rest of the transponder and it's ARINC bus interface

enum MsfsTransponderState {
  Off = 0,
  Standby = 1,
  Test = 2,
  /** Mode A only */
  On = 3,
  /** Mode C */
  Alt = 4,
  /** Mode S */
  Ground = 5,
}

/**
 * The transponders contained within the two AESS (SURV SYS 1 and 2), interfacing with MSFS.
 * MSFS supports only one transponder (systems.cfg Transponder.1), so this drives the single sim transponder as the
 * transponder of the selected XPDR & TCAS system (L:A32NX_TRANSPONDER_SYSTEM): with SYS 1 selected it is XPDR 1
 * (failure 34003, AC ESS), with SYS 2 selected XPDR 2 (failure 34004, AC 4). The other system's transponder is in
 * standby on the real aircraft, so it has no sim output; its state is still published (L:A32NX_XPDR_n_FAILED), with
 * the TCAS state of each system (L:A32NX_TCAS_n_FAILED).
 */
export class Transponder implements Instrument {
  private readonly sub = this.bus.getSubscriber<MfdSurvEvents>();

  private readonly isInoperative = Subject.create(false);
  private readonly xpdr1Failed = Subject.create(false);
  private readonly xpdr2Failed = Subject.create(false);
  private readonly tcas1Failed = Subject.create(false);
  private readonly tcas2Failed = Subject.create(false);

  private readonly msfsCircuitVar = `CIRCUIT SWITCH ON:${this.msfsCircuit}`;

  private readonly isAuto = ConsumerSubject.create(this.sub.on('mfd_xpdr_set_auto'), false);
  private readonly isAltReportingOn = ConsumerSubject.create(this.sub.on('mfd_xpdr_set_alt_reporting'), true);
  /** XPDR mode ON (A380 FCOM DSC-34-20-40): the transponder replies as in flight, also on ground */
  private readonly isOn = ConsumerSubject.create(this.sub.on('mfd_xpdr_set_on'), false);

  private readonly msfsTransponderState = Subject.create(MsfsTransponderState.Off);
  /** The single MSFS transponder. */
  private readonly msfsTransponderStateVar = 'TRANSPONDER STATE:1';

  /**
   * Ctor.
   * @param msfsCircuit The MSFS circuit index of the sim transponder (used to switch it off when it should not transmit/receive).
   * @param acEssPowered Whether the AC ESS busbar (400XP) is powered: supply of SURV SYS 1.
   * @param ac4Powered Whether the AC 4 busbar is powered: supply of SURV SYS 2.
   * @param failuresConsumer The failures consumer.
   */
  constructor(
    private readonly bus: EventBus,
    private readonly msfsCircuit: number,
    private readonly acEssPowered: Subscribable<boolean>,
    private readonly ac4Powered: Subscribable<boolean>,
    private readonly failuresConsumer: FailuresConsumer,
  ) {}

  /** @inheritdoc */
  init(): void {
    this.failuresConsumer.register(A380Failure.Transponder1);
    this.failuresConsumer.register(A380Failure.Transponder2);

    this.msfsTransponderState.sub(
      (v) => SimVar.SetSimVarValue(this.msfsTransponderStateVar, SimVarValueType.Enum, v),
      true,
    );
    this.xpdr1Failed.sub((v) => SimVar.SetSimVarValue('L:A32NX_XPDR_1_FAILED', SimVarValueType.Bool, v), true);
    this.xpdr2Failed.sub((v) => SimVar.SetSimVarValue('L:A32NX_XPDR_2_FAILED', SimVarValueType.Bool, v), true);
    this.tcas1Failed.sub((v) => SimVar.SetSimVarValue('L:A32NX_TCAS_1_FAILED', SimVarValueType.Bool, v), true);
    this.tcas2Failed.sub((v) => SimVar.SetSimVarValue('L:A32NX_TCAS_2_FAILED', SimVarValueType.Bool, v), true);

    Wait.awaitSubscribable(GameStateProvider.get(), (v) => v === GameState.ingame).then(() => {
      // set initial squawk code as the cfg file param doesn't seem to work
      SimVar.SetSimVarValue('K:XPNDR_SET', 'number', 0x2000);
      if (!SimVar.GetSimVarValue('L:A32NX_COLD_AND_DARK_SPAWN', 'Bool')) {
        this.bus.getPublisher<MfdSurvEvents>().pub('mfd_xpdr_set_auto', true, true);
      }
    });
  }

  /** @inheritdoc */
  onUpdate(): void {
    const acEss = this.acEssPowered.get();
    const ac4 = this.ac4Powered.get();
    const isFailureActive = (failure: number) => this.failuresConsumer.isActive(failure);
    // Each system's own state (powered and not failed), shown on the MFD SURV STATUS & SWITCHING page
    this.xpdr1Failed.set(!isTransponderOperative(1, acEss, ac4, isFailureActive));
    this.xpdr2Failed.set(!isTransponderOperative(2, acEss, ac4, isFailureActive));

    const selectedSystem = selectedSurvSystem(
      SimVar.GetSimVarValue('L:A32NX_TRANSPONDER_SYSTEM', SimVarValueType.Number),
    );
    this.isInoperative.set(selectedSystem === 2 ? this.xpdr2Failed.get() : this.xpdr1Failed.get());

    // Each system's TCAS: lost with its XPDR (A380 FCOM SURV XPDR 1(2) FAULT STATUS, a380_fcom.txt:167311-167322);
    // the single sim TCAS computer (L:A32NX_TCAS_FAULT) is the TCAS of the selected system.
    const selectedTcasFault = SimVar.GetSimVarValue('L:A32NX_TCAS_FAULT', SimVarValueType.Bool) > 0;
    this.tcas1Failed.set(isTcasInoperative(1, selectedSystem, this.xpdr1Failed.get(), selectedTcasFault));
    this.tcas2Failed.set(isTcasInoperative(2, selectedSystem, this.xpdr2Failed.get(), selectedTcasFault));
    const isMsfsTransponderOn = SimVar.GetSimVarValue(this.msfsCircuitVar, 'boolean') > 0;
    const shouldBeOn = !this.isInoperative.get();

    if (isMsfsTransponderOn !== shouldBeOn) {
      SimVar.SetSimVarValue('K:ELECTRICAL_CIRCUIT_TOGGLE', 'number', this.msfsCircuit);
    }

    // FIXME better logic. Each AESS has a hardwired LGERS air/ground signal on the 380
    const isOnGround = SimVar.GetSimVarValue('L:A32NX_LGCIU_1_LEFT_GEAR_COMPRESSED', SimVarValueType.Bool);

    switch (true) {
      case !shouldBeOn:
        this.msfsTransponderState.set(MsfsTransponderState.Off);
        break;
      case !this.isAuto.get():
        this.msfsTransponderState.set(MsfsTransponderState.Standby);
        break;
      case (!isOnGround || this.isOn.get()) && this.isAltReportingOn.get():
        this.msfsTransponderState.set(MsfsTransponderState.Alt);
        break;
      case !isOnGround || this.isOn.get():
        this.msfsTransponderState.set(MsfsTransponderState.On);
        break;
      default:
        this.msfsTransponderState.set(MsfsTransponderState.Ground);
        break;
    }
  }
}
