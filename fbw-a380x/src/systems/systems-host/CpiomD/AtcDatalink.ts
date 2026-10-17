//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { Atc } from '@datalink/atc';
import { ConsumerSubject, EventBus, MappedSubject, SimVarValueType } from '@microsoft/msfs-sdk';
import { CpiomData } from '@providers/CpiomPublisher';
import { ResetPanelSimvars } from '../../instruments/src/MsfsAvionicsCommon/providers/ResetPanelPublisher';
import { ATC_FUNCTION_AVAILABLE_VAR, isAtcFunctionAvailable } from '@shared/AtcFunctionAvailability';

export class AtcDatalink {
  private readonly sub = this.bus.getSubscriber<CpiomData & ResetPanelSimvars>();

  private readonly cpiomD1Available = ConsumerSubject.create(this.sub.on('cpiom_d_available_1'), false);

  private readonly atcResetPulled = ConsumerSubject.create(this.sub.on('a380x_reset_panel_atc'), false);

  /** CPIOM D1 available and the ATC RESET pb pushed in: pulling it powers the ATC down, pushing it powers it up again */
  private readonly available = MappedSubject.create(
    ([cpiomD1, reset]) => isAtcFunctionAvailable(cpiomD1, reset),
    this.cpiomD1Available,
    this.atcResetPulled,
  );

  private readonly atc: Atc;
  constructor(private readonly bus: EventBus) {
    // the A380X RING waits for the reading time of the message (A380 FCOM DSC-46-10-20-70)
    this.atc = new Atc(this.bus, false, false, true);
    this.available.sub((available: boolean) => {
      if (available) {
        this.atc.powerUp();
      } else {
        // the power down loses the connections and the mailbox messages (ATC RESET, PRO-SUP-46 l.184555-184557)
        this.atc.powerDown();
      }
      SimVar.SetSimVarValue(ATC_FUNCTION_AVAILABLE_VAR, SimVarValueType.Bool, available);
    }, true);
  }

  public init(): void {
    this.atc.initialize();
  }
}
