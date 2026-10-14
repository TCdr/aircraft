// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The rules of the RMP radio navigation backup mode (NAV key on): which STBY NAV key selects which receiver, and when
// the ILS can no longer be tuned from the RMP.

import { Arinc429Word } from '@flybywiresim/fbw-sdk';

/** The STBY NAV keys of the RMP */
export type RmpStbyNavKey = 'VOR' | 'ILS' | 'GLS' | 'MLS' | 'ADF';

/** The panel modes (L:A32NX_RMP_{side}_SELECTED_MODE) of the STBY NAV keys, which also light their green monitor light */
export const RMP_PANEL_MODE_VOR = 6;
export const RMP_PANEL_MODE_ILS = 7;
export const RMP_PANEL_MODE_ADF = 10;

/**
 * The panel mode a STBY NAV key selects, or null when pressing it does nothing.
 *
 * A320 FCOM DSC-34-NAV-30-30 (3) STBY NAV keys (a320_fcom.txt l.53452-53456): "When the NAV key is on and the flight
 * crew presses one of these STBY NAV keys, the ACTIVE window displays the frequency/channel to which that receiver is
 * tuned. The green monitor light on the selected key comes on". The keys only work in the NAV backup mode.
 *
 * GLS and MLS are options (marked as such in l.53433 "VOR, ILS, GLS, MLS and ADF receivers") that the simulated
 * aircraft does not have: there is no receiver to display, so their keys do nothing (before, they showed a fake
 * 808.080 in both windows).
 * @param key the pressed key
 * @param navBackupSelected whether the NAV key of this RMP is on
 */
export function rmpStbyNavKeyPanelMode(key: RmpStbyNavKey, navBackupSelected: boolean): number | null {
  if (!navBackupSelected) {
    return null;
  }
  switch (key) {
    case 'VOR':
      return RMP_PANEL_MODE_VOR;
    case 'ILS':
      return RMP_PANEL_MODE_ILS;
    case 'ADF':
      return RMP_PANEL_MODE_ADF;
    default:
      // GLS, MLS: not installed
      return null;
  }
}

/** The radio height below which the ILS frequency and course are frozen (FCOM l.111377) */
export const ILS_TUNE_INHIBIT_RADIO_HEIGHT_FT = 700;

/** The FMA mode values (L:A32NX_FMA_LATERAL_MODE / L:A32NX_FMA_VERTICAL_MODE) of LOC or G/S capture to roll out */
const FMA_APPROACH_CAPTURE_MODE_MIN = 30; // LOC_CPT / GS_CPT
const FMA_APPROACH_CAPTURE_MODE_MAX = 34; // ROLL_OUT
/** L:A32NX_FMA_LATERAL_ARMED bit of LOC, L:A32NX_FMA_VERTICAL_ARMED bit of G/S */
const FMA_LATERAL_ARMED_LOC_BIT = 1;
const FMA_VERTICAL_ARMED_GS_BIT = 4;

/** Whether an FMA mode value is LOC (or G/S) capture, track, LAND, FLARE or ROLL OUT */
function isApproachCaptureMode(mode: number): boolean {
  return mode >= FMA_APPROACH_CAPTURE_MODE_MIN && mode <= FMA_APPROACH_CAPTURE_MODE_MAX;
}

/**
 * Whether the APPR mode, LOC and G/S, is armed or engaged (FCOM l.111377 "with APPR mode (LOC and G/S) armed or
 * engaged").
 * @param lateralMode L:A32NX_FMA_LATERAL_MODE
 * @param lateralArmed L:A32NX_FMA_LATERAL_ARMED (bit mask)
 * @param verticalMode L:A32NX_FMA_VERTICAL_MODE
 * @param verticalArmed L:A32NX_FMA_VERTICAL_ARMED (bit mask)
 */
export function isApprModeArmedOrEngaged(
  lateralMode: number,
  lateralArmed: number,
  verticalMode: number,
  verticalArmed: number,
): boolean {
  const locArmedOrEngaged = isApproachCaptureMode(lateralMode) || ((lateralArmed >> FMA_LATERAL_ARMED_LOC_BIT) & 1) > 0;
  const glideSlopeArmedOrEngaged =
    isApproachCaptureMode(verticalMode) || ((verticalArmed >> FMA_VERTICAL_ARMED_GS_BIT) & 1) > 0;
  return locArmedOrEngaged && glideSlopeArmedOrEngaged;
}

/**
 * Whether the aircraft has reached 700 ft RA: a radio altimeter that works reads less than 700 ft. The radio heights
 * are ARINC 429 words (L:A32NX_RA_{1,2}_RADIO_ALTITUDE); a failed one, or one above its range (no computed data), does
 * not count. Before, the raw words were compared with 700, which never inhibited anything.
 * @param radioAltitude1 the raw word of RA 1
 * @param radioAltitude2 the raw word of RA 2
 */
export function isBelowIlsTuneInhibitHeight(radioAltitude1: number, radioAltitude2: number): boolean {
  return [radioAltitude1, radioAltitude2].some((raw) => {
    const word = new Arinc429Word(raw);
    return word.isNormalOperation() && word.value < ILS_TUNE_INHIBIT_RADIO_HEIGHT_FT;
  });
}

/**
 * ILS tune inhibit, A320 FCOM PRO-NOR-SRP-01-70 DATA LOCK (a320_fcom.txt l.111377-111380): "When the aircraft reaches
 * 700 ft RA with APPR mode (LOC and G/S) armed or engaged, the ILS FREQ and course are frozen in the receiver. This
 * function (ILS tune inhibit) is available, when at least one AP/FD is engaged. Any attempt to change the ILS frequency
 * or CRS, via the MCDU or RMP, does not affect the receiver."
 *
 * It applies to the ILS only: VOR and ADF stay tunable from the RMP. Before, it froze every navaid, and needed an AP
 * (an FD alone did not count).
 * @param isIlsReceiver whether the RMP is on the ILS (STBY NAV ILS key)
 * @param belowInhibitHeight see isBelowIlsTuneInhibitHeight
 * @param apprArmedOrEngaged see isApprModeArmedOrEngaged
 * @param apOrFdEngaged whether at least one AP or one FD is engaged
 */
export function isIlsTuneInhibited(
  isIlsReceiver: boolean,
  belowInhibitHeight: boolean,
  apprArmedOrEngaged: boolean,
  apOrFdEngaged: boolean,
): boolean {
  return isIlsReceiver && belowInhibitHeight && apprArmedOrEngaged && apOrFdEngaged;
}
