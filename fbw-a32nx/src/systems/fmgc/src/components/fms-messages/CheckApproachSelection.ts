// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FMMessage } from '@flybywiresim/fbw-sdk';
import { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { Navigation } from '@fmgc/navigation/Navigation';

import { FMMessageSelector, FMMessageUpdate } from './FmsMessages';
import { FMMessageTypes } from './FmMessages';
import { isCheckApproachSelection } from './CheckApproachSelectionLogic';
import { distanceToTopOfDescent } from './TopOfDescentDistance';

/** The PFD reads this L:var to show CHECK APPR SELECTION on the FMA line 3 */
const PFD_MESSAGE_VAR = 'L:A32NX_PFD_MSG_CHECK_APPR_SELECTION';

/**
 * CHECK APPR SELECTION: a non ILS approach in the F-PLN with an
 * ILS manually tuned on the RAD NAV page, near the T/D or in descent/approach. Sent to the MCDU and to the PFD FMA.
 */
export class CheckApproachSelection implements FMMessageSelector {
  public readonly message: FMMessage = FMMessageTypes.CheckApproachSelection;

  private navigation?: Navigation;

  private guidanceController?: GuidanceController;

  private flightPlanService?: FlightPlanService;

  private lastState = false;

  init(navigation: Navigation, guidanceController: GuidanceController, flightPlanService: FlightPlanService): void {
    this.navigation = navigation;
    this.guidanceController = guidanceController;
    this.flightPlanService = flightPlanService;
    SimVar.SetSimVarValue(PFD_MESSAGE_VAR, 'bool', false);
  }

  process(_: number): FMMessageUpdate {
    if (!this.navigation || !this.guidanceController || !this.flightPlanService) {
      return FMMessageUpdate.NO_ACTION;
    }
    const tuner = this.navigation.getNavaidTuner();
    const ilsManuallyTuned = ([1, 2] as const).some((index) => {
      const mmr = tuner.getMmrRadioTuningStatus(index);
      return mmr.manual && mmr.frequency !== null;
    });
    const approach = this.flightPlanService.hasActive ? this.flightPlanService.active.approach : undefined;
    const newState = isCheckApproachSelection(
      approach ? approach.type : null,
      ilsManuallyTuned,
      SimVar.GetSimVarValue('L:A32NX_FMGC_FLIGHT_PHASE', 'number'),
      distanceToTopOfDescent(this.guidanceController),
    );

    if (newState !== this.lastState) {
      this.lastState = newState;
      SimVar.SetSimVarValue(PFD_MESSAGE_VAR, 'bool', newState);
      return newState ? FMMessageUpdate.SEND : FMMessageUpdate.RECALL;
    }
    return FMMessageUpdate.NO_ACTION;
  }
}
