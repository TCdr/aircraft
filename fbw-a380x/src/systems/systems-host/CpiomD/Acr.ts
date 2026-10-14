//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0
import { FailuresConsumer, FrequencyMode, RegisteredSimVar } from '@flybywiresim/fbw-sdk';
import { ConsumerSubject, EventBus, SimVarValueType } from '@microsoft/msfs-sdk';
import { Router } from '@datalink/router';
import { CpiomData } from '@providers/CpiomPublisher';
import { A380Failure } from '@failures';
import { A380xVhfProvider } from './A380xVhfProvider';

export class Acr {
  private static readonly RmpModeActive3 = RegisteredSimVar.create<number>(
    'L:FBW_RMP_MODE_ACTIVE_3',
    SimVarValueType.Enum,
  );

  private readonly available = ConsumerSubject.create(
    this.bus.getSubscriber<CpiomData>().on('cpiom_d_available_3'),
    false,
  );
  private readonly router: Router;

  constructor(
    private readonly bus: EventBus,
    private readonly failuresConsumer: FailuresConsumer,
  ) {
    this.router = new Router(
      bus,
      false,
      false,
      new A380xVhfProvider(
        () => Acr.RmpModeActive3.get() === FrequencyMode.Data,
        () => this.failuresConsumer.isActive(A380Failure.Vhf3),
      ),
    );
    this.available.sub((available) => {
      if (available) {
        this.router.powerUp();
      } else {
        this.router.powerDown();
      }
    }, true);
  }

  init(): void {
    this.router.initialize();
  }
}
