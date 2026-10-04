// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0
import { ConsumerSubject, DebounceTimer, EventBus, Subject } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { FwsSoundManager } from './FwsSoundManager';
import { PseudoFWC } from './PseudoFWC';
import { UpdateThrottler } from '../../../../../../fbw-common/src/systems/shared/src';
import { A32NXElectricalSystemEvents } from '@shared/publishers/A32NXElectricalSystemPublisher';
import { FwsLegacyFlightPhases } from './FwsLegacyFlightPhases';
import { A320Failure } from '../../../failures/src/a320';
import {
  computeFwcAvailability,
  FWC_AVAILABILITY_UNPOWERED,
  FwcAvailability,
  isSameFwcAvailability,
} from './Logic/FwcAvailability';

export class FwsManager {
  /** Time to inhibit master warnings and cautions during startup in ms */
  private static readonly FWC_STARTUP_TIME = 5000;
  private static readonly FWC_PROCESSING_INTERVAL_MS = 60;
  private readonly fwsSoundManager: FwsSoundManager;
  private readonly pseudoFwc: PseudoFWC;
  private readonly fwcFlightPhases = new FwsLegacyFlightPhases();
  private readonly fwsUpdateThrottler = new UpdateThrottler(FwsManager.FWC_PROCESSING_INTERVAL_MS); // has to be > 100 due to pulse nodes
  private readonly failuresConsumer = new FailuresConsumer();
  /** FWC 1 supply (A320 FCOM ELEC AC ESS BUS FAULT: INOP SYS FWC 1) */
  private readonly acEssBusPowered = ConsumerSubject.create(
    this.bus.getSubscriber<A32NXElectricalSystemEvents>().on('a32nx_elec_ac_ess_bus_is_powered'),
    false,
  );
  /** FWC 2 supply (A320 FCOM ELEC AC BUS 2 FAULT: INOP SYS FWC 2) */
  private readonly acBus2Powered = ConsumerSubject.create(
    this.bus.getSubscriber<A32NXElectricalSystemEvents>().on('a32nx_elec_ac_2_bus_is_powered'),
    false,
  );
  /**
   * Which of the two FWCs works. The A32NX has one PseudoFWC doing the work of both: it runs while at least one FWC
   * works, and shows the FWC fault alerts from this.
   */
  private readonly fwcAvailability = Subject.create<FwcAvailability>(FWC_AVAILABILITY_UNPOWERED, isSameFwcAvailability);
  private readonly anyFwcOperative = this.fwcAvailability.map((a) => a.anyFwcOperative);
  private readonly startupTimer = new DebounceTimer();
  /** At least one FWC works and has completed its startup: the warnings, lights and aurals are output */
  private readonly startupCompleted = Subject.create(false);

  constructor(private readonly bus: EventBus) {
    this.fwsSoundManager = new FwsSoundManager(bus, this.startupCompleted);
    this.pseudoFwc = new PseudoFWC(bus, this.fwsSoundManager, this.startupCompleted, this.fwcAvailability);
  }

  public init() {
    this.failuresConsumer.register(A320Failure.Fwc1);
    this.failuresConsumer.register(A320Failure.Fwc2);

    this.pseudoFwc.init();
    this.anyFwcOperative.sub((v) => {
      //FIXME this should take into account startup time and also possible transient power loss. Should also stop fws execution?.
      if (v) {
        this.startupTimer.schedule(() => {
          this.startupCompleted.set(true);
          console.log('FWC startup completed.');
        }, FwsManager.FWC_STARTUP_TIME);
      } else {
        this.startupTimer.clear();
        this.startupCompleted.set(false);
        console.log('FWC shut down.');
      }
    });
  }

  public update(deltaTime: number): void {
    this.failuresConsumer.update();
    this.fwcAvailability.set(
      computeFwcAvailability({
        fwc1Failed: this.failuresConsumer.isActive(A320Failure.Fwc1),
        fwc2Failed: this.failuresConsumer.isActive(A320Failure.Fwc2),
        fwc1Powered: this.acEssBusPowered.get(),
        fwc2Powered: this.acBus2Powered.get(),
      }),
    );

    const deltaTimeThrottled = this.fwsUpdateThrottler.canUpdate(deltaTime);
    if (deltaTimeThrottled !== -1 && deltaTime !== 0) {
      this.fwcFlightPhases.update(deltaTimeThrottled);
      this.pseudoFwc.update(deltaTimeThrottled);
      this.fwsSoundManager.onUpdate(deltaTimeThrottled);
    }
  }
}
