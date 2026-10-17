// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FMMessage } from '@flybywiresim/fbw-sdk';
import { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { Navigation } from '@fmgc/navigation/Navigation';
import { defaultRnpForArea } from '@fmgc/navigation/RequiredPerformance';

import { FMMessageSelector, FMMessageUpdate } from './FmsMessages';
import { FMMessageTypes } from './FmMessages';
import { formatRnpValue, MessageTextLatch, RnpMessage, rnpMessage } from './FmsMessageConditions';

/**
 * The RNP message of the active flight plan for the current pilot RNP entry (see rnpMessage), shared by the A320 MCDU
 * and the A380 MFD.
 * @param navigation the FM navigation (pilot RNP)
 * @param flightPlanService the flight plan service (active leg RNP and flight area)
 * @returns the message to show, or null
 */
export function activeRnpMessage(navigation: Navigation, flightPlanService: FlightPlanService): RnpMessage | null {
  if (!flightPlanService.hasActive || !navigation.isPilotRnp()) {
    return null;
  }
  const plan = flightPlanService.active;
  const activeLeg = plan.activeLeg;
  const legRnp = activeLeg && activeLeg.isDiscontinuity === false ? activeLeg.rnp : undefined;
  return rnpMessage(navigation.getActiveRnp() ?? null, legRnp, defaultRnpForArea(plan.calculateActiveArea()));
}

/** Shows one of the two RNP messages, with the RNP value in place of XX.XX */
abstract class RnpMessageSelector implements FMMessageSelector {
  public message: FMMessage;

  private readonly latch = new MessageTextLatch();

  private navigation?: Navigation;

  private flightPlanService?: FlightPlanService;

  protected constructor(
    private readonly template: FMMessage,
    private readonly kind: RnpMessage['kind'],
  ) {
    this.message = { ...template };
  }

  init(navigation: Navigation, _guidanceController: GuidanceController, flightPlanService: FlightPlanService): void {
    this.navigation = navigation;
    this.flightPlanService = flightPlanService;
  }

  process(_deltaTime: number): FMMessageUpdate {
    if (!this.navigation || !this.flightPlanService) {
      return FMMessageUpdate.NO_ACTION;
    }
    const wanted = activeRnpMessage(this.navigation, this.flightPlanService);
    const text =
      wanted !== null && wanted.kind === this.kind
        ? this.template.text!.replace('XX.XX', formatRnpValue(wanted.rnp))
        : null;

    const update = this.latch.update(text);
    if (update === null) {
      return FMMessageUpdate.NO_ACTION;
    }
    // The message text carries the value: recall the text that was sent
    this.message = { ...this.template, text: update.text };
    return update.action === 'send' ? FMMessageUpdate.SEND : FMMessageUpdate.RECALL;
  }
}

/**
 * AREA RNP IS XX.XX: the RNP manually entered on the PROG page is larger than the default RNP of the current flight
 * area, and the navigation database has no RNP for the active leg. XX.XX is the area RNP.
 */
export class AreaRnp extends RnpMessageSelector {
  constructor() {
    super(FMMessageTypes.AreaRnp, 'area');
  }
}

/**
 * PROCEDURE RNP IS XX.XX: the RNP manually entered on the PROG page is larger than the RNP of the navigation database
 * for the active leg. XX.XX is the procedure RNP.
 */
export class ProcedureRnp extends RnpMessageSelector {
  constructor() {
    super(FMMessageTypes.ProcedureRnp, 'procedure');
  }
}
