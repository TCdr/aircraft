// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FMMessage } from '@flybywiresim/fbw-sdk';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { Navigation } from '@fmgc/navigation/Navigation';
import { FmgcFlightPhase } from '@shared/flightphase';

import { FMMessageSelector, FMMessageUpdate } from './FmsMessages';
import { FMMessageTypes } from './FmMessages';
import { GpsDeselectedMessageLogic } from './GpsDeselectedMessageLogic';
import { distanceToTopOfDescent } from './TopOfDescentDistance';

/** GPS IS DESELECTED (A320 FCOM DSC-22_20-50-10-28): the GPS deselected, 80 NM before the T/D or in approach phase */
export class GpsIsDeselected implements FMMessageSelector {
  public readonly message: FMMessage = FMMessageTypes.GpsIsDeselected;

  private readonly logic = new GpsDeselectedMessageLogic();

  private navigation?: Navigation;

  private guidanceController?: GuidanceController;

  init(navigation: Navigation, guidanceController: GuidanceController): void {
    this.navigation = navigation;
    this.guidanceController = guidanceController;
  }

  process(_: number): FMMessageUpdate {
    if (!this.navigation || !this.guidanceController) {
      return FMMessageUpdate.NO_ACTION;
    }
    const approachPhase = SimVar.GetSimVarValue('L:A32NX_FMGC_FLIGHT_PHASE', 'number') === FmgcFlightPhase.Approach;
    switch (
      this.logic.update(
        this.navigation.isGpsDeselected(),
        approachPhase,
        distanceToTopOfDescent(this.guidanceController),
      )
    ) {
      case 'send':
        return FMMessageUpdate.SEND;
      case 'recall':
        return FMMessageUpdate.RECALL;
      default:
        return FMMessageUpdate.NO_ACTION;
    }
  }
}
