// Copyright (c) 2021-2023 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { Atc } from '@datalink/atc';
import { Aoc } from '@datalink/aoc';
import { SimVarHandling } from '@datalink/common';
import { Router, VhfRadioInterface } from '@datalink/router';
import { EventBus, EventSubscriber, Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { PowerSupplyBusTypes } from './powersupply';
import { FailuresConsumer, RegisteredSimVar } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { AtsuPowerSwitch, atsuRunStates } from './AtsuFailureStates';

class A32nxVhfProvider implements VhfRadioInterface {
  private static readonly ComActiveFrequency3 = RegisteredSimVar.create<number>(
    'A:COM ACTIVE FREQUENCY:3',
    SimVarValueType.MHz,
  );

  public isDataModeActive(): boolean {
    return A32nxVhfProvider.ComActiveFrequency3.get() === 0;
  }
}

export class AtsuSystem implements Instrument {
  private readonly simVarHandling: SimVarHandling;

  private readonly powerSupply: EventSubscriber<PowerSupplyBusTypes>;

  private readonly atc: Atc;

  private readonly aoc: Aoc;

  private readonly router: Router;

  /** The ATSU and ATSU AOC function flyPad failures (see AtsuFailureStates) */
  private readonly failuresConsumer = new FailuresConsumer();

  private acBus1Powered = false;

  private readonly powerSwitch: AtsuPowerSwitch;

  constructor(private readonly bus: EventBus) {
    this.simVarHandling = new SimVarHandling(this.bus);
    this.router = new Router(this.bus, false, false, new A32nxVhfProvider());
    this.atc = new Atc(this.bus, false, false);
    this.aoc = new Aoc(this.bus, false);
    this.powerSwitch = new AtsuPowerSwitch({
      powerUpAtsu: () => {
        this.router.powerUp();
        this.atc.powerUp();
      },
      powerDownAtsu: () => {
        this.atc.powerDown();
        this.router.powerDown();
      },
      powerUpAoc: () => this.aoc.powerUp(),
      powerDownAoc: () => this.aoc.powerDown(),
    });

    this.powerSupply = this.bus.getSubscriber<PowerSupplyBusTypes>();
    this.powerSupply.on('acBus1').handle((powered: boolean) => {
      this.acBus1Powered = powered;
      this.updatePower();
    });
  }

  public init(): void {
    this.failuresConsumer.register(A320Failure.Atsu);
    this.failuresConsumer.register(A320Failure.AtsuAoc);
    this.simVarHandling.initialize();
    this.simVarHandling.startPublish();
    this.router.initialize();
    this.atc.initialize();
    this.aoc.initialize();
  }

  /** Runs the router, ATC and AOC functions while the ATSU is supplied and not failed */
  private updatePower(): void {
    this.powerSwitch.update(
      atsuRunStates({
        acBus1Powered: this.acBus1Powered,
        atsuFailed: this.failuresConsumer.isActive(A320Failure.Atsu),
        aocFailed: this.failuresConsumer.isActive(A320Failure.AtsuAoc),
      }),
    );
  }

  public onUpdate(): void {
    this.failuresConsumer.update();
    this.updatePower();
    this.simVarHandling.update();
  }
}
