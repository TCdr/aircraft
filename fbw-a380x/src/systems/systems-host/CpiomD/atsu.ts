//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0
import { Aoc } from '@datalink/aoc';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { EventBus, EventSubscriber } from '@microsoft/msfs-sdk';
import { A380Failure } from '@failures';
import { AtsuFmsClient } from './AtsuFmsClient';
import { PowerSupplyBusTypes } from '../Misc/powersupply';
import { isAocAvailable } from './AocAvailability';

export class AtsuSystem {
  //FIXME: This should be in NSS? Not CPIOM D.
  private readonly powerSupply: EventSubscriber<PowerSupplyBusTypes>;

  private readonly aoc: Aoc;

  private readonly atsuFmsClient: AtsuFmsClient;

  private acBus1Powered = false;

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

    this.powerSupply = this.bus.getSubscriber<PowerSupplyBusTypes>();
    this.powerSupply.on('acBus1').handle((powered: boolean) => {
      //FIXME: Should be NSS status
      this.acBus1Powered = powered;
      this.updateAocPower();
    });
    // Both SCIs lost: "The AOC is inoperative. It can no longer send and receive messages to/from the ground."
    // (A380 FCOM COM NSS/AVNCS DATA XFR FAULT, a380_fcom.txt l.169947)
    [A380Failure.Sci1, A380Failure.Sci2].forEach((failure, index) =>
      this.failuresConsumer.register(failure, (active) => {
        this.sciFailed[index] = active;
        this.updateAocPower();
      }),
    );
  }

  private updateAocPower(): void {
    const available = isAocAvailable(this.acBus1Powered, this.sciFailed);
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
  }
}
