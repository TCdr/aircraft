// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ApproachType } from '@flybywiresim/fbw-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';

/*
 * CHECK APPR SELECTION (MCDU type II amber, also on the PFD FMA line 3), A320 FCOM:
 * - MCDU messages (a320_fcom.txt l.22524-22536): "A non ILS/GLS approach is part of the F-PLN and an ILS/GLS is
 *   manually-tuned on the RAD NAV page. It reminds the flight crew that APP NAV/FINAL are the available guidance modes
 *   for the approach. Displayed when in cruise at less than 100 NM from the top of descent, or in descent, or approach
 *   phase."
 * - FMA special messages (l.33663-33671), DSC-22_30-80-30-10 (l.31580-31584): same conditions.
 */

/** l.22535: "in cruise at less than 100 NM from the top of descent" */
export const CHECK_APPR_SELECTION_DISTANCE_BEFORE_TOD_NM = 100;

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
