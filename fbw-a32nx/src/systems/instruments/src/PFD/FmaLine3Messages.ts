// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Trigger logic of the FMA line 3 special messages that the PFD computes from the data it already receives.
 */

/** Thrust lever angle of the FLX/MCT detent, degrees (the FWC uses the same value, PseudoFWC thr1TLA >= 35) */
const TLA_MCT_DEGREES = 35;
/** Thrust lever angle of the TOGA detent, degrees (PseudoFWC thr1TLA >= 45) */
const TLA_TOGA_DEGREES = 45;

const FOR_GA_SET_TOGA_MAX_RA_FT = 1_000;

const DISCONNECT_AP_BELOW_MINIMUM_FT = 50;
const DISCONNECT_AP_NO_MINIMUM_AGL_FT = 400;

const GREEN_DOT_SPEED_MARGIN_KT = 10;

export interface ForGaSetTogaInputs {
  apOrFdEngaged: boolean;
  /** an approach vertical mode is engaged: G/S, FINAL, LAND or FLARE */
  approachVerticalModeActive: boolean;
  /** radio altitude in feet, null without a valid radio altimeter */
  radioAltitudeFt: number | null;
  /** thrust lever angles in degrees */
  tlaDegrees: number[];
}

/**
 * FOR GA: SET TOGA (amber): AP/FD in an approach vertical mode below 1 000 ft RA, with all thrust levers at or above
 * MCT but below TOGA.
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
 * DISCONNECT AP FOR LDG (amber): on a non precision approach, the AP still engaged at the minimum minus 50 ft, or at
 * 400 ft AGL without a minimum. The AP (not the FD) is the condition, as in the standard procedure.
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

export interface SetGreenDotSpeedInputs {
  /** engine-out: one engine not running in flight */
  engineOut: boolean;
  /** the speed target is selected (not managed) */
  speedSelected: boolean;
  /** FCU selected speed in knots, null when not valid (e.g. Mach selected) */
  fcuSelectedSpeedKt: number | null;
  /** green dot speed in knots, null when not valid */
  greenDotKt: number | null;
  altOrAltStarActive: boolean;
}

/**
 * SET GREEN DOT SPEED (white): engine-out with a selected speed target, the FCU selected speed at green dot +10 kt or
 * more (not in ALT* or ALT), or at green dot -10 kt or less (in any mode).
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
