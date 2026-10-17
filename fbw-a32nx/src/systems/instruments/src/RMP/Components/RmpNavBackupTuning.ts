// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The rules of the RMP radio navigation backup mode (NAV key on): which STBY NAV key selects which receiver, and when
// the ILS can no longer be tuned from the RMP.

import { Arinc429Word } from '@flybywiresim/fbw-sdk';

export type RmpStbyNavKey = 'VOR' | 'ILS' | 'GLS' | 'MLS' | 'ADF';

/** The panel modes (L:A32NX_RMP_{side}_SELECTED_MODE) of the STBY NAV keys, which also light their green monitor light */
export const RMP_PANEL_MODE_VOR = 6;
export const RMP_PANEL_MODE_ILS = 7;
export const RMP_PANEL_MODE_ADF = 10;

/**
 * The panel mode a STBY NAV key selects, or null when pressing it does nothing.
 *
 * The STBY NAV keys only work in the NAV backup mode (NAV key on): the pressed key shows the frequency/channel of its
 * receiver in the ACTIVE window and lights its green monitor light.
 *
 * GLS and MLS are options that the simulated aircraft does not have: there is no receiver to display, so their keys do
 * nothing.
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

/** The radio height below which the ILS frequency and course are frozen */
const ILS_TUNE_INHIBIT_RADIO_HEIGHT_FT = 700;

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
 * Whether the APPR mode is armed or engaged: both LOC and G/S armed or engaged.
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
 * not count.
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
 * ILS tune inhibit: below 700 ft RA with the APPR mode armed or engaged and at least one AP or FD engaged, the ILS
 * frequency and course are frozen in the receiver; changes from the MCDU or the RMP no longer reach it.
 *
 * It applies to the ILS only: VOR and ADF stay tunable from the RMP.
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
