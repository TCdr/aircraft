//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0
import { Aoc } from '@datalink/aoc';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { ClockEvents, EventBus, SimVarValueType } from '@microsoft/msfs-sdk';
import { A380Failure } from '@failures';
import { AtsuFmsClient } from './AtsuFmsClient';
import { AocAutoPrint } from './AocAutoPrint';
import {
  areAocDownlinksInhibited,
  isAocAvailable,
  NSS_AVNCS_ANSU_HEALTHY_VARS,
  NSS_DATA_TO_AVNCS_PB_VAR,
} from './AocAvailability';

export class AtsuSystem {
  /** The AOC application of the NSS AVNCS side (the sim runs it here, in the systems host) */
  private readonly aoc: Aoc;

  private readonly atsuFmsClient: AtsuFmsClient;

  private readonly aocAutoPrint: AocAutoPrint;

  /** NSS AVNCS ANSU 1 and ANSU 2 healthy (they host the AOC) */
  private readonly nssAvncsAnsuHealthy = [false, false];

  /** SCI 1 and SCI 2 failed (flyPad failures 46008, 46009) */
  private readonly sciFailed = [false, false];

  /** Whether the AOC is powered up, to power it up or down only on a change */
  private aocPoweredUp: boolean | null = null;

  constructor(
    private readonly bus: EventBus,
    private readonly failuresConsumer: FailuresConsumer,
  ) {
    this.aoc = new Aoc(this.bus, false);
    this.atsuFmsClient = new AtsuFmsClient(this.bus);
    this.aocAutoPrint = new AocAutoPrint(this.bus);

    // Both SCIs lost: the AOC is inoperative and can no longer exchange messages with the ground
    [A380Failure.Sci1, A380Failure.Sci2].forEach((failure, index) =>
      this.failuresConsumer.register(failure, (active) => {
        this.sciFailed[index] = active;
        this.updateAocPower();
      }),
    );

    // The ANSUs and the NSS DATA TO AVNCS pb-sw, read twice a second (the OIT writes the ANSU health)
    this.bus
      .getSubscriber<ClockEvents>()
      .on('realTime')
      .atFrequency(2)
      .handle(() => this.readNssState());
  }

  private readNssState(): void {
    NSS_AVNCS_ANSU_HEALTHY_VARS.forEach((name, index) => {
      this.nssAvncsAnsuHealthy[index] = SimVar.GetSimVarValue(name, SimVarValueType.Bool) > 0;
    });
    this.updateAocPower();
    this.aoc.setDownlinksInhibited(
      areAocDownlinksInhibited(!(SimVar.GetSimVarValue(NSS_DATA_TO_AVNCS_PB_VAR, SimVarValueType.Bool) > 0)),
    );
  }

  private updateAocPower(): void {
    const available = isAocAvailable(this.nssAvncsAnsuHealthy, this.sciFailed);
    if (available === this.aocPoweredUp) {
      return;
    }
    this.aocPoweredUp = available;
    if (available) {
      this.aoc.powerUp();
    } else {
      this.aoc.powerDown();
    }
  }

  public init(): void {
    this.aoc.initialize();
    this.atsuFmsClient.init();
    this.aocAutoPrint.init();
  }
}
