// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Trigger logic of the FMA line 3 special messages that the PFD computes from the data it already receives
 * (A320 FCOM DSC-22_30-100 SPECIAL MESSAGES (FMA COLUMNS 2 AND 3), a320_fcom.txt l.33650-33725).
 */

/** Thrust lever angle of the FLX/MCT detent, degrees (the FWC uses the same value, PseudoFWC thr1TLA >= 35) */
export const TLA_MCT_DEGREES = 35;
/** Thrust lever angle of the TOGA detent, degrees (PseudoFWC thr1TLA >= 45) */
export const TLA_TOGA_DEGREES = 45;

/** l.33713: "below 1 000 ft RA" */
export const FOR_GA_SET_TOGA_MAX_RA_FT = 1_000;

/** l.33660: "Minimum minus 50 ft" */
export const DISCONNECT_AP_BELOW_MINIMUM_FT = 50;
/** l.33661: "400 ft AGL (if no minimum entered)" */
export const DISCONNECT_AP_NO_MINIMUM_AGL_FT = 400;

/** l.33680-33681: "Green Dot -10 kt, or Green Dot +10 kt" */
export const GREEN_DOT_SPEED_MARGIN_KT = 10;

/** Inputs of FOR GA: SET TOGA */
export interface ForGaSetTogaInputs {
  /** an AP or an FD is engaged */
  apOrFdEngaged: boolean;
  /** an approach vertical mode is engaged: G/S, FINAL, LAND or FLARE */
  approachVerticalModeActive: boolean;
  /** radio altitude in feet, null without a valid radio altimeter */
  radioAltitudeFt: number | null;
  /** thrust lever angles in degrees */
  tlaDegrees: number[];
}

/**
 * FOR GA: SET TOGA (amber), l.33713-33715: "When AP/FD is in approach vertical mode and aircraft is below 1 000 ft RA,
 * this message is displayed if all thrust levers are moved to or above MCT, but below TOGA."
 * @param i the inputs
 * @returns whether the message shows
 */
export function isForGaSetToga(i: ForGaSetTogaInputs): boolean {
  return (
    i.apOrFdEngaged &&
    i.approachVerticalModeActive &&
    i.radioAltitudeFt !== null &&
    i.radioAltitudeFt < FOR_GA_SET_TOGA_MAX_RA_FT &&
    i.tlaDegrees.length > 0 &&
    i.tlaDegrees.every((tla) => tla >= TLA_MCT_DEGREES && tla < TLA_TOGA_DEGREES)
  );
}

/** Inputs of DISCONNECT AP FOR LDG */
export interface DisconnectApForLdgInputs {
  apEngaged: boolean;
  /**
   * a non precision approach is flown: FMGC approach phase with a non precision vertical mode (FINAL, FPA or V/S).
   * Design choice: the PFD does not receive the FMS approach type; an ILS flown with G/S or LAND is the precision case.
   */
  nonPrecisionApproach: boolean;
  /** baro corrected altitude in feet, null when invalid */
  baroAltitudeFt: number | null;
  /** MDA (BARO minimum) in feet, null when none entered */
  mdaFt: number | null;
  /** DH (RADIO minimum) in feet, null when none entered */
  dhFt: number | null;
  /** radio altitude in feet, null without a valid radio altimeter */
  radioAltitudeFt: number | null;
}

/**
 * DISCONNECT AP FOR LDG (amber), l.33657-33661: "This message is displayed when, during a Non Precision Approach, the
 * AP/FD remains engaged at: Minimum minus 50 ft, or 400 ft AGL (if no minimum entered)". The SOP (l.103297-103298) says
 * "At minimum -50 ft, if the AP is still engaged", so the AP is the condition.
 * @param i the inputs
 * @returns whether the message shows
 */
export function isDisconnectApForLdg(i: DisconnectApForLdgInputs): boolean {
  if (!i.apEngaged || !i.nonPrecisionApproach) {
    return false;
  }
  if (i.mdaFt !== null) {
    return i.baroAltitudeFt !== null && i.baroAltitudeFt <= i.mdaFt - DISCONNECT_AP_BELOW_MINIMUM_FT;
  }
  if (i.dhFt !== null) {
    return i.radioAltitudeFt !== null && i.radioAltitudeFt <= i.dhFt - DISCONNECT_AP_BELOW_MINIMUM_FT;
  }
  return i.radioAltitudeFt !== null && i.radioAltitudeFt <= DISCONNECT_AP_NO_MINIMUM_AGL_FT;
}

/** Inputs of SET GREEN DOT SPEED */
export interface SetGreenDotSpeedInputs {
  /** engine-out: one engine not running in flight */
  engineOut: boolean;
  /** the speed target is selected (not managed) */
  speedSelected: boolean;
  /** FCU selected speed in knots, null when not valid (e.g. Mach selected) */
  fcuSelectedSpeedKt: number | null;
  /** green dot speed in knots, null when not valid */
  greenDotKt: number | null;
  /** ALT* or ALT is engaged */
  altOrAltStarActive: boolean;
}

/**
 * SET GREEN DOT SPEED (white), l.33676-33681 and the MCDU message table l.23022-23036: "The aircraft is in Engine Out
 * mode and the SPEED target is selected. This message is displayed if the FCU selected speed is: Green Dot -10 kt, or
 * Green Dot +10 kt, except in ALT* and ALT mode." (MCDU: "FCU-selected speed equal to, or greater than, green-dot speed
 * +10 kt, and ALT* or ALT not active, or FCU-selected speed equal to or less than green-dot speed -10 kt.")
 * @param i the inputs
 * @returns whether the message shows
 */
export function isSetGreenDotSpeed(i: SetGreenDotSpeedInputs): boolean {
  if (!i.engineOut || !i.speedSelected || i.fcuSelectedSpeedKt === null || i.greenDotKt === null) {
    return false;
  }
  const tooFast = i.fcuSelectedSpeedKt >= i.greenDotKt + GREEN_DOT_SPEED_MARGIN_KT && !i.altOrAltStarActive;
  const tooSlow = i.fcuSelectedSpeedKt <= i.greenDotKt - GREEN_DOT_SPEED_MARGIN_KT;
  return tooFast || tooSlow;
}
