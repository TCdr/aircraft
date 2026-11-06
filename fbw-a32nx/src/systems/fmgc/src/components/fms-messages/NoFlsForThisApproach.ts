// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FMMessage } from '@flybywiresim/fbw-sdk';
import { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { Navigation } from '@fmgc/navigation/Navigation';
import { noFlsApproachKey } from '@fmgc/navigation/fls/FlsBeam';

import { FMMessageSelector, FMMessageUpdate } from './FmsMessages';
import { FMMessageTypes } from './FmMessages';

/** NO FLS FOR THIS APPR: the selected non precision approach has no FLS beam. Type II, sent to the MCDU only. */
export class NoFlsForThisApproach implements FMMessageSelector {
  public readonly message: FMMessage = FMMessageTypes.NoFlsForThisApproach;

  private flightPlanService?: FlightPlanService;

  /** The approach the message was sent for, null while there is no message */
  private lastKey: string | null = null;

  init(_navigation: Navigation, _guidanceController: GuidanceController, flightPlanService: FlightPlanService): void {
    this.flightPlanService = flightPlanService;
  }

  process(_: number): FMMessageUpdate {
    if (!this.flightPlanService) {
      return FMMessageUpdate.NO_ACTION;
    }
    const key = noFlsApproachKey(this.flightPlanService.hasActive ? this.flightPlanService.active : null);

    if (key !== this.lastKey) {
      this.lastKey = key;
      return key !== null ? FMMessageUpdate.SEND : FMMessageUpdate.RECALL;
    }
    return FMMessageUpdate.NO_ACTION;
  }
}
