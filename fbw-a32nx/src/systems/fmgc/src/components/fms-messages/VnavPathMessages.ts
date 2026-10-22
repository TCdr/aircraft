// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FMMessage } from '@flybywiresim/fbw-sdk';
import { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { Navigation } from '@fmgc/navigation/Navigation';
import { ArmedVerticalMode, isArmed } from '@shared/autopilot';

import { FMMessageSelector, FMMessageUpdate } from './FmsMessages';
import { FMMessageTypes } from './FmMessages';
import { MessageTextLatch } from './FmsMessageConditions';
import { isNoVertPathIntercept, speedErrorWaypoint, waypointSpeedPredictions } from './VnavPathConditions';

/** SPD ERROR AT (waypoint) on the A320 MCDU, in lateral managed flight */
export class SpeedErrorAtWaypoint implements FMMessageSelector {
  public message: FMMessage = { ...FMMessageTypes.SpeedErrorAtWaypoint };

  private readonly latch = new MessageTextLatch();

  private shownIdent: string | null = null;

  private guidanceController?: GuidanceController;

  private flightPlanService?: FlightPlanService;

  init(_navigation: Navigation, guidanceController: GuidanceController, flightPlanService: FlightPlanService): void {
    this.guidanceController = guidanceController;
    this.flightPlanService = flightPlanService;
  }

  process(_deltaTime: number): FMMessageUpdate {
    if (!this.guidanceController || !this.flightPlanService) {
      return FMMessageUpdate.NO_ACTION;
    }
    const vnav = this.guidanceController.vnavDriver;
    const predictions = vnav.mcduProfile?.isReadyToDisplay ? vnav.mcduProfile.waypointPredictions : null;
    if (predictions && this.flightPlanService.hasActive && vnav.isLatAutoControlActive()) {
      const plan = this.flightPlanService.active;
      this.shownIdent = speedErrorWaypoint(
        waypointSpeedPredictions(predictions, (index) => {
          const leg = plan.maybeElementAt(index);
          return leg && leg.isDiscontinuity === false ? leg.ident : undefined;
        }),
        this.shownIdent,
      );
    } else {
      this.shownIdent = null;
    }

    const update = this.latch.update(
      this.shownIdent !== null ? FMMessageTypes.SpeedErrorAtWaypoint.text + this.shownIdent : null,
    );
    if (update === null) {
      return FMMessageUpdate.NO_ACTION;
    }
    this.message = { ...FMMessageTypes.SpeedErrorAtWaypoint, text: update.text };
    return update.action === 'send' ? FMMessageUpdate.SEND : FMMessageUpdate.RECALL;
  }
}

/** NO VERT PATH INTERCEPT on the A320 MCDU */
export class NoVertPathIntercept implements FMMessageSelector {
  public message = FMMessageTypes.NoVertPathIntercept;

  private guidanceController?: GuidanceController;

  private shown = false;

  init(_navigation: Navigation, guidanceController: GuidanceController, _flightPlanService: FlightPlanService): void {
    this.guidanceController = guidanceController;
  }

  process(_deltaTime: number): FMMessageUpdate {
    if (!this.guidanceController) {
      return FMMessageUpdate.NO_ACTION;
    }
    const wanted = isNoVertPathIntercept(
      isArmed(SimVar.GetSimVarValue('L:A32NX_FMA_VERTICAL_ARMED', 'number'), ArmedVerticalMode.FINAL),
      SimVar.GetSimVarValue('VERTICAL SPEED', 'feet per minute'),
      this.guidanceController.vnavDriver.getLinearDeviation(),
    );
    if (wanted === this.shown) {
      return FMMessageUpdate.NO_ACTION;
    }
    this.shown = wanted;
    return wanted ? FMMessageUpdate.SEND : FMMessageUpdate.RECALL;
  }
}

/** MORE DRAG on the A320 MCDU, shown and removed with the PFD message */
export class MoreDrag implements FMMessageSelector {
  public message = FMMessageTypes.MoreDrag;

  private guidanceController?: GuidanceController;

  private shown = false;

  init(_navigation: Navigation, guidanceController: GuidanceController): void {
    this.guidanceController = guidanceController;
  }

  process(_deltaTime: number): FMMessageUpdate {
    const wanted = this.guidanceController?.vnavDriver.isMoreDragRequired() ?? false;
    if (wanted === this.shown) {
      return FMMessageUpdate.NO_ACTION;
    }
    this.shown = wanted;
    return wanted ? FMMessageUpdate.SEND : FMMessageUpdate.RECALL;
  }
}
