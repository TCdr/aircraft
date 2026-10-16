// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ApproachType } from '@flybywiresim/fbw-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import { isLandingSystemApproach } from '@fmgc/components/fms-messages/CheckApproachSelectionLogic';

/*
 * CHECK APPR SEL, A380 FCOM DSC-22-FMS-20-110 (a380_fcom.txt l.44966-44979), type II, MFD and PFD (FMA line 3,
 * DSC-22-FG-80-80 l.19241): "The flight crew has manually tuned an ILS(GLS), on the POSITION/NAVAIDS page, that does
 * not correspond with the approach selected in the flight plan. This message is only displayed, when the aircraft is:
 * In cruise, and less then 100 nm from the T/D, or In descent, or In approach, and the altitude is higher then 800 ft."
 * (The A380 has no RWY/LS MISMATCH message: a tuned ILS that is not the one of the ILS approach is a mismatch too.)
 */

/** l.44976: "In cruise, and less then 100 nm from the T/D" */
export const CHECK_APPR_SEL_DISTANCE_BEFORE_TOD_NM = 100;
/** l.44978: "In approach, and the altitude is higher then 800 ft" */
export const CHECK_APPR_SEL_MIN_HEIGHT_IN_APPROACH_FT = 800;

/** The landing system that the approach of the flight plan uses */
export interface ApproachLandingSystem {
  /** the approach type */
  type: ApproachType;
  /** ident of the recommended navaid of the final leg (the LOC/ILS of an ILS approach), null without */
  ident: string | null;
}

/** The ILS that the flight crew tuned on the POSITION/NAVAIDS page (MMR tuning status) */
export interface ManuallyTunedIls {
  /** the ident, null when tuned by frequency only */
  ident: string | null;
  /** the frequency in MHz, null when unknown */
  frequency: number | null;
}

/**
 * Whether the manually tuned ILS corresponds with the approach: the approach uses a landing system and the tuned ILS
 * is that landing system (same ident). Design choice: an ILS tuned by frequency only has no ident to compare, it
 * corresponds with an ILS approach when its frequency is the one of the approach (approachFrequency).
 * @param approach the approach of the active flight plan
 * @param tuned the manually tuned ILS
 * @param approachFrequency the frequency in MHz of the landing system of the approach, null when unknown
 * @returns whether it corresponds
 */
export function tunedIlsCorrespondsWithApproach(
  approach: ApproachLandingSystem,
  tuned: ManuallyTunedIls,
  approachFrequency: number | null,
): boolean {
  if (!isLandingSystemApproach(approach.type)) {
    return false;
  }
  if (tuned.ident !== null && approach.ident !== null) {
    return tuned.ident === approach.ident;
  }
  return tuned.frequency !== null && approachFrequency !== null && Math.abs(tuned.frequency - approachFrequency) < 0.01;
}

/**
 * @param approach the approach of the active flight plan, null without an approach
 * @param tuned the manually tuned ILS, null when the ILS is tuned by the FMS (or not tuned)
 * @param approachFrequency the frequency in MHz of the landing system of the approach, null when unknown
 * @param flightPhase the FMGC flight phase
 * @param distanceToTopOfDescentNm the distance to the T/D in NM (negative once past it), null without a T/D
 * @param heightAboveDestinationFt the altitude above the destination elevation in feet, null when unknown. Design
 * choice: "the altitude is higher then 800 ft" is read as the height above the destination airport.
 * @returns whether CHECK APPR SEL applies
 */
export function isCheckApproachSelection(
  approach: ApproachLandingSystem | null,
  tuned: ManuallyTunedIls | null,
  approachFrequency: number | null,
  flightPhase: FmgcFlightPhase,
  distanceToTopOfDescentNm: number | null,
  heightAboveDestinationFt: number | null,
): boolean {
  if (approach === null || tuned === null || tunedIlsCorrespondsWithApproach(approach, tuned, approachFrequency)) {
    return false;
  }
  switch (flightPhase) {
    case FmgcFlightPhase.Cruise:
      return distanceToTopOfDescentNm !== null && distanceToTopOfDescentNm < CHECK_APPR_SEL_DISTANCE_BEFORE_TOD_NM;
    case FmgcFlightPhase.Descent:
      return true;
    case FmgcFlightPhase.Approach:
      return heightAboveDestinationFt !== null && heightAboveDestinationFt > CHECK_APPR_SEL_MIN_HEIGHT_IN_APPROACH_FT;
    default:
      return false;
  }
}
