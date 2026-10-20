// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import { FlightPlanOperationEvents } from '@fmgc/events/FlightPlanOperationEvents';
import { FlightPlanInterface } from '@fmgc/flightplanning/FlightPlanInterface';
import { ConstantMachSegmentDeletionReason, isCruisePhaseExit } from '@fmgc/flightplanning/ConstantMachSegment';

/**
 * Deletes the constant Mach segment (CMS) of the active flight plan when the cruise phase ends or an engine fails,
 * and announces the automatic deletions the aircraft displays a message for.
 */
export class ConstantMachSegmentAutoDeletion {
  private engineOut = false;

  constructor(
    bus: EventBus,
    private readonly flightPlanService: Pick<FlightPlanInterface, 'autoDeleteConstantMachSegment'>,
    announcedReasons: readonly ConstantMachSegmentDeletionReason[],
    announce: () => void,
  ) {
    bus
      .getSubscriber<FlightPlanOperationEvents>()
      .on('fms_constant_mach_segment_auto_deleted')
      .handle((reason) => {
        if (announcedReasons.includes(reason)) {
          announce();
        }
      });
  }

  public onFlightPhaseChanged(previousPhase: FmgcFlightPhase, nextPhase: FmgcFlightPhase): void {
    if (isCruisePhaseExit(previousPhase, nextPhase)) {
      this.flightPlanService
        .autoDeleteConstantMachSegment(ConstantMachSegmentDeletionReason.CruisePhaseExit)
        .catch(console.error);
    }
  }

  public onEngineOutChanged(engineOut: boolean): void {
    if (engineOut && !this.engineOut) {
      this.flightPlanService
        .autoDeleteConstantMachSegment(ConstantMachSegmentDeletionReason.EngineOut)
        .catch(console.error);
    }
    this.engineOut = engineOut;
  }
}
