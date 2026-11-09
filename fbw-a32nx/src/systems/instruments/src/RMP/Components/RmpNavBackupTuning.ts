// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The rules of the RMP radio navigation backup mode (NAV key on): which STBY NAV key selects which receiver, what a
// transfer tunes, and when the ILS and the GLS can no longer be tuned from the RMP.

import { MathUtils } from '@microsoft/msfs-sdk';
import { Arinc429Word } from '@flybywiresim/fbw-sdk';
import {
  GBAS_CHANNEL_MAX,
  GBAS_CHANNEL_MIN,
} from '../../../../../../../fbw-common/src/systems/shared/src/gbas/GbasApproachTable';

export type RmpStbyNavKey = 'VOR' | 'ILS' | 'GLS' | 'MLS' | 'ADF';

/** The panel modes (L:A32NX_RMP_{side}_SELECTED_MODE) of the STBY NAV keys, which also light their green monitor light */
export const RMP_PANEL_MODE_VOR = 6;
export const RMP_PANEL_MODE_ILS = 7;
export const RMP_PANEL_MODE_GLS = 8;
export const RMP_PANEL_MODE_ADF = 10;

/**
 * The panel mode a STBY NAV key selects, or null when pressing it does nothing.
 *
 * The STBY NAV keys only work in the NAV backup mode (NAV key on): the pressed key shows the frequency/channel of its
 * receiver in the ACTIVE window and lights its green monitor light.
 *
 * The MLS is an option that the simulated aircraft does not have: there is no receiver to display, so its key does
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
    case 'GLS':
      return RMP_PANEL_MODE_GLS;
    case 'ADF':
      return RMP_PANEL_MODE_ADF;
    default:
      // MLS: not installed
      return null;
  }
}

/** The channel the STBY window of the GLS starts with: the bottom of the channel range */
export const GLS_CHANNEL_DEFAULT = GBAS_CHANNEL_MIN;

/** The channel the RMPs tuned to the GLS, which the FMS NavaidTuner tunes both MMRs to; 0 for none */
export const RMP_GLS_CHANNEL_VAR = 'L:A32NX_RMP_GLS_CHANNEL';

/** The channels of one hundred, which the inner knob cycles through: the outer knob moves by this many */
const GLS_CHANNELS_PER_HUNDRED = 100;

/**
 * The channel after a turn of the knobs. The outer knob changes the leading three digits and stops at the ends of the
 * channel range; the inner knob changes the last two digits and wraps inside the hundred.
 *
 * Design choice: the split of the 5 digits between the knobs, which the manual leaves open (outer: most significant
 * digits, inner: least significant digits).
 *
 * Design choice: at the bottom end the outer knob stops at the first channel of the range, so 20050 turned down ends on
 * 20001, as 20000 does not exist.
 * @param channel the standby channel
 * @param outerOffset clicks of the outer knob
 * @param innerOffset clicks of the inner knob
 */
export function stepGlsChannel(channel: number, outerOffset: number, innerOffset: number): number {
  const moved = MathUtils.clamp(channel + outerOffset * GLS_CHANNELS_PER_HUNDRED, GBAS_CHANNEL_MIN, GBAS_CHANNEL_MAX);
  if (innerOffset === 0) {
    return moved;
  }

  const hundred = Math.floor(moved / GLS_CHANNELS_PER_HUNDRED) * GLS_CHANNELS_PER_HUNDRED;
  const firstChannel = Math.max(hundred, GBAS_CHANNEL_MIN);
  const lastChannel = Math.min(hundred + GLS_CHANNELS_PER_HUNDRED - 1, GBAS_CHANNEL_MAX);
  const count = lastChannel - firstChannel + 1;
  return firstChannel + ((((moved - firstChannel + innerOffset) % count) + count) % count);
}

/** The channel as the digits of the RMP window; a string, as the display would show a number as an ADF frequency */
export function formatGlsChannel(channel: number): string {
  return channel.toFixed(0);
}

/** What a press of the TRANSFER key tunes */
export type RmpTransferTuning = 'none' | 'gls-channel' | 'ils-frequency' | 'frequency';

/**
 * What the transfer key tunes. The ILS and the GLS are shared by both RMPs, so they are only tuned while both RMPs are
 * in the NAV backup mode. An ILS tunes a frequency and takes the MMRs out of the GLS mode, a GLS tunes a channel.
 * @param receiver the receiver of the STBY NAV key that is selected; OTHER for the VOR and the ADF
 * @param bothNavKeysOn whether the NAV key of both RMPs is on
 */
export function rmpTransferTuning(receiver: 'ILS' | 'GLS' | 'OTHER', bothNavKeysOn: boolean): RmpTransferTuning {
  if (receiver === 'OTHER') {
    return 'frequency';
  }
  if (!bothNavKeysOn) {
    return 'none';
  }
  return receiver === 'GLS' ? 'gls-channel' : 'ils-frequency';
}

/**
 * Whether the GLS channel of the RMPs is dropped when an RMP leaves the NAV backup mode: only when no other RMP is
 * left in it. Nothing is tuned by the RMPs then, the FMS takes the receivers back.
 * @param otherRmpInNavBackup whether the NAV key of the other RMP is on
 */
export function isRmpGlsChannelDropped(otherRmpInNavBackup: boolean): boolean {
  return !otherRmpInNavBackup;
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
 * Landing system tune inhibit: below 700 ft RA with the APPR mode armed or engaged and at least one AP or FD engaged,
 * the ILS frequency and course are frozen in the receiver; changes from the MCDU or the RMP no longer reach it.
 *
 * Design choice: the GLS channel freezes under the same conditions. The receiver is locked in both directions on final
 * approach, so a channel change would not reach it either.
 *
 * VOR and ADF stay tunable from the RMP.
 * @param isLsReceiver whether the RMP is on the ILS or the GLS (STBY NAV ILS or GLS key)
 * @param belowInhibitHeight see isBelowIlsTuneInhibitHeight
 * @param apprArmedOrEngaged see isApprModeArmedOrEngaged
 * @param apOrFdEngaged whether at least one AP or one FD is engaged
 */
export function isLsTuneInhibited(
  isLsReceiver: boolean,
  belowInhibitHeight: boolean,
  apprArmedOrEngaged: boolean,
  apOrFdEngaged: boolean,
): boolean {
  return isLsReceiver && belowInhibitHeight && apprArmedOrEngaged && apOrFdEngaged;
}
