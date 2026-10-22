// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { findConstantMachSegment } from '@fmgc/flightplanning/ConstantMachSegment';
import { ReadonlyFlightPlanElement } from '@fmgc/flightplanning/legs/ReadonlyFlightPlanLeg';
import { ReadonlyFlightPlan } from '@fmgc/flightplanning/plans/ReadonlyFlightPlan';
import { FmgcFlightPhase } from '@shared/flightphase';

import { NXSystemMessages, TypeIIMessage } from '../shared/NXSystemMessages';

/** The PFD shows CHECK SPD MODE on the FMA line 3 while this L:var is set */
const CHECK_SPEED_MODE_PFD_VAR = 'L:A32NX_PFD_MSG_CHECK_SPEED_MODE';

/**
 * The flight phase changes that call for the managed speed: CLIMB to CRUISE without a speed/Mach preselected for the
 * cruise, and CLIMB or CRUISE to DESCENT.
 * @param previousPhase the phase before the change
 * @param nextPhase the new phase
 * @param hasPreselectedSpeedForNextPhase a speed/Mach is preselected for the new phase
 */
export function isCheckSpeedModePhaseChange(
  previousPhase: FmgcFlightPhase,
  nextPhase: FmgcFlightPhase,
  hasPreselectedSpeedForNextPhase: boolean,
): boolean {
  if (nextPhase === FmgcFlightPhase.Cruise) {
    return previousPhase === FmgcFlightPhase.Climb && !hasPreselectedSpeedForNextPhase;
  }
  return (
    nextPhase === FmgcFlightPhase.Descent &&
    (previousPhase === FmgcFlightPhase.Climb || previousPhase === FmgcFlightPhase.Cruise)
  );
}

/**
 * The aircraft sequenced the start waypoint of the constant Mach segment: the leg that ends at it was the active leg at
 * the previous check, and the active leg is now after it.
 * @param previousActiveLeg the active leg at the previous check, null without one
 * @param activeLegIndex the index of the active leg now
 * @param startLegIndex the index of the leg that ends at the CMS start waypoint, null without a CMS
 * @param legAt the flight plan element at an index
 */
export function hasSequencedConstantMachStart<T>(
  previousActiveLeg: T | null,
  activeLegIndex: number,
  startLegIndex: number | null,
  legAt: (index: number) => T | undefined,
): boolean {
  return (
    previousActiveLeg !== null &&
    startLegIndex !== null &&
    activeLegIndex > startLegIndex &&
    legAt(startLegIndex) === previousActiveLeg
  );
}

export interface CheckSpeedModeMessageHost {
  isSpeedSelected(): boolean;
  /** true as well when the speed control state is unknown */
  isSpeedManaged(): boolean;
  /** The CHECK SPD MODE entry of the message list, undefined when it is not in the list */
  queuedMessage(): { cleared: boolean } | undefined;
  /** The message stays in the list until removeMessageFromQueue: it has no resolved condition of its own */
  addMessageToQueue(message: TypeIIMessage, onClear: () => void): void;
  removeMessageFromQueue(text: string): void;
}

/**
 * CHECK SPD MODE on the MFD and the PFD: in selected speed, when the situation calls for the managed speed (a flight
 * phase change, see isCheckSpeedModePhaseChange, or the CMS start waypoint sequenced). The message stays until the
 * managed speed is engaged; clearing it on the MFD also removes it from the PFD.
 */
export class CheckSpeedModeMessage {
  private previousActiveLeg: ReadonlyFlightPlanElement | null = null;

  constructor(private readonly host: CheckSpeedModeMessageHost) {}

  onFlightPhaseChanged(
    previousPhase: FmgcFlightPhase,
    nextPhase: FmgcFlightPhase,
    hasPreselectedSpeedForNextPhase: boolean,
  ): void {
    if (isCheckSpeedModePhaseChange(previousPhase, nextPhase, hasPreselectedSpeedForNextPhase)) {
      this.raise();
    }
  }

  /** Checks the CMS start and the end of the selected speed, once per FMS cycle */
  update(plan: ReadonlyFlightPlan | null): void {
    if (plan) {
      const activeLegIndex = plan.activeLegIndex;
      const constantMachSegment = findConstantMachSegment(plan.allLegs);
      if (
        hasSequencedConstantMachStart(
          this.previousActiveLeg,
          activeLegIndex,
          constantMachSegment?.startLegIndex ?? null,
          (index) => plan.maybeElementAt(index),
        )
      ) {
        this.raise();
      }
      this.previousActiveLeg = plan.maybeElementAt(activeLegIndex) ?? null;
    } else {
      this.previousActiveLeg = null;
    }

    if (this.host.queuedMessage() && this.host.isSpeedManaged()) {
      this.host.removeMessageFromQueue(NXSystemMessages.checkSpeedMode.text);
      SimVar.SetSimVarValue(CHECK_SPEED_MODE_PFD_VAR, 'bool', false);
    }
  }

  private raise(): void {
    if (!this.host.isSpeedSelected()) {
      return;
    }
    const queued = this.host.queuedMessage();
    if (queued && !queued.cleared) {
      return;
    }
    this.host.addMessageToQueue(NXSystemMessages.checkSpeedMode, () =>
      SimVar.SetSimVarValue(CHECK_SPEED_MODE_PFD_VAR, 'bool', false),
    );
    SimVar.SetSimVarValue(CHECK_SPEED_MODE_PFD_VAR, 'bool', true);
  }
}
