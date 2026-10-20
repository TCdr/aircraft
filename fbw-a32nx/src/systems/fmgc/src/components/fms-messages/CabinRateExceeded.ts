// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { Navigation } from '@fmgc/navigation/Navigation';

import { FMMessageSelector, FMMessageUpdate } from './FmsMessages';
import { FMMessageTypes } from './FmMessages';

export class CabinRateExceeded implements FMMessageSelector {
  message = FMMessageTypes.CabinRateExceeded;

  private guidanceController: GuidanceController | undefined;

  private lastState = false;

  init(_navigation: Navigation, guidanceController: GuidanceController): void {
    this.guidanceController = guidanceController;
  }

  process(_: number): FMMessageUpdate {
    const newState = this.guidanceController?.vnavDriver?.shouldShowCabinRateExceeded() ?? false;

    if (newState !== this.lastState) {
      this.lastState = newState;

      return newState ? FMMessageUpdate.SEND : FMMessageUpdate.RECALL;
    }

    return FMMessageUpdate.NO_ACTION;
  }
}
