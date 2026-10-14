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
import {
  ATSU_CIRCUIT_BREAKER_VAR,
  AtsuPowerSwitch,
  DatalinkInterfaceStates,
  atsuCircuitBreakerPulled,
  atsuRunStates,
  datalinkInterfaceStates,
} from './AtsuFailureStates';

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

  /** The ATSU, ATSU AOC function, DCDU and printer flyPad failures (see AtsuFailureStates) */
  private readonly failuresConsumer = new FailuresConsumer();

  private acBus1Powered = false;

  private readonly powerSwitch: AtsuPowerSwitch;

  /** The ATSU C/Bs L15 and L16 on 121VU (the ATSU reset of the FCOM, see AtsuFailureStates) */
  private readonly circuitBreakerVar = RegisteredSimVar.create<number>(ATSU_CIRCUIT_BREAKER_VAR, SimVarValueType.Enum);

  /** What the DCDU, its screens (model) and the MCDU read, see AtsuFailureStates.datalinkInterfaceStates */
  private readonly atsuOffVar = RegisteredSimVar.createBoolean('L:A32NX_ATSU_OFF');

  private readonly dcduFailedVars = [1, 2].map((dcdu) => RegisteredSimVar.createBoolean(`L:A32NX_DCDU_${dcdu}_FAILED`));

  private readonly printerFailedVar = RegisteredSimVar.createBoolean('L:A32NX_PRINTER_FAILED');

  /** The last written interface states, the variables are written on a change only */
  private writtenInterfaceStates: DatalinkInterfaceStates | null = null;

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
    this.failuresConsumer.register(A320Failure.Dcdu1);
    this.failuresConsumer.register(A320Failure.Dcdu2);
    this.failuresConsumer.register(A320Failure.Printer);
    this.simVarHandling.initialize();
    this.simVarHandling.startPublish();
    this.router.initialize();
    this.atc.initialize();
    this.aoc.initialize();
  }

  /** Runs the router, ATC and AOC functions while the ATSU is supplied, its C/Bs are in and it is not failed */
  private updatePower(): void {
    const runStates = atsuRunStates({
      acBus1Powered: this.acBus1Powered,
      circuitBreakerPulled: atsuCircuitBreakerPulled(this.circuitBreakerVar.get()),
      atsuFailed: this.failuresConsumer.isActive(A320Failure.Atsu),
      aocFailed: this.failuresConsumer.isActive(A320Failure.AtsuAoc),
    });
    this.powerSwitch.update(runStates);

    const interfaceStates = datalinkInterfaceStates(runStates, {
      dcdu1Failed: this.failuresConsumer.isActive(A320Failure.Dcdu1),
      dcdu2Failed: this.failuresConsumer.isActive(A320Failure.Dcdu2),
      printerFailed: this.failuresConsumer.isActive(A320Failure.Printer),
    });
    const written = this.writtenInterfaceStates;
    if (written === null || written.atsuOff !== interfaceStates.atsuOff) {
      this.atsuOffVar.set(interfaceStates.atsuOff);
    }
    for (let dcdu = 0; dcdu < 2; dcdu++) {
      if (written === null || written.dcduFailed[dcdu] !== interfaceStates.dcduFailed[dcdu]) {
        this.dcduFailedVars[dcdu].set(interfaceStates.dcduFailed[dcdu]);
      }
    }
    if (written === null || written.printerFailed !== interfaceStates.printerFailed) {
      this.printerFailedVar.set(interfaceStates.printerFailed);
    }
    this.writtenInterfaceStates = interfaceStates;
  }

  public onUpdate(): void {
    this.failuresConsumer.update();
    this.updatePower();
    this.simVarHandling.update();
  }
}
