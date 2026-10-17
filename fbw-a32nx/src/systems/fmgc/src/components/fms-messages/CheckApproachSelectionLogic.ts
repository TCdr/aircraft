// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ApproachType } from '@flybywiresim/fbw-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';

/*
 * CHECK APPR SELECTION (MCDU type II amber, also on the PFD FMA line 3): a non ILS/GLS approach is in the F-PLN while
 * an ILS/GLS is manually tuned on the RAD NAV page, which reminds the crew that only APP NAV/FINAL guide the approach.
 * It is shown in cruise less than 100 NM before the top of descent, and in the descent and approach phases.
 */

/** In cruise the message waits until the aircraft is this close to the top of descent */
const CHECK_APPR_SELECTION_DISTANCE_BEFORE_TOD_NM = 100;

/**
 * Approaches for which the FMS itself tunes the landing system (LandingSystemSelectionManager isTunableApproach): the
 * "ILS" approaches of the message. Any other approach (RNAV, VOR, NDB...) is a non ILS approach.
 * @param approachType the approach type of the active flight plan
 * @returns whether the approach uses the landing system
 */
export function isLandingSystemApproach(approachType: ApproachType): boolean {
  switch (approachType) {
    case ApproachType.Igs:
    case ApproachType.Ils:
    case ApproachType.Lda:
    case ApproachType.Loc:
    case ApproachType.LocBackcourse:
    case ApproachType.Sdf:
      return true;
    default:
      return false;
  }
}

/**
 * @param approachType the approach type of the active flight plan, null without an approach
 * @param ilsManuallyTuned an ILS frequency is manually tuned on the MCDU RAD NAV page (MMR 1 or 2)
 * @param flightPhase the FMGC flight phase
 * @param distanceToTopOfDescentNm the distance to the T/D in NM (negative once past it), null without a T/D
 * @returns whether CHECK APPR SELECTION applies
 */
export function isCheckApproachSelection(
  approachType: ApproachType | null,
  ilsManuallyTuned: boolean,
  flightPhase: FmgcFlightPhase,
  distanceToTopOfDescentNm: number | null,
): boolean {
  if (approachType === null || isLandingSystemApproach(approachType) || !ilsManuallyTuned) {
    return false;
  }
  switch (flightPhase) {
    case FmgcFlightPhase.Cruise:
      return (
        distanceToTopOfDescentNm !== null && distanceToTopOfDescentNm < CHECK_APPR_SELECTION_DISTANCE_BEFORE_TOD_NM
      );
    case FmgcFlightPhase.Descent:
    case FmgcFlightPhase.Approach:
      return true;
    default:
      return false;
  }
}
