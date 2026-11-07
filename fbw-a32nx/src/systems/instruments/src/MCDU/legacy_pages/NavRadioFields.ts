// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { MmrRadioTuningStatus } from '@fmgc/navigation/NavaidTuner';
import { lsFrequencyEnteredByPilot, lsIdentEnteredByPilot } from '@fmgc/navigation/LandingSystemTexts';

/** The tuning of the landing system as the LS field of the RADIO NAV page shows it */
export type LsTuning = Pick<
  MmrRadioTuningStatus,
  | 'manual'
  | 'ident'
  | 'frequency'
  | 'facility'
  | 'course'
  | 'courseManual'
  | 'backcourse'
  | 'slope'
  | 'gls'
  | 'glsEntry'
>;

export type LsEntryKind = 'frequency' | 'channel' | 'ident' | 'invalid';

/**
 * What the crew typed into the LS field: a frequency (3 digits, up to 2 decimals), a GLS channel (5 digits), or an ILS
 * ident or GLS reference path identifier (1 to 4 characters; the page tries the identifier as a GLS first).
 * @param input the scratchpad content, not CLR
 */
export function classifyLsEntry(input: string): LsEntryKind {
  if (/^\d{3}(\.\d{1,2})?$/.test(input)) {
    return 'frequency';
  }
  if (/^\d{5}$/.test(input)) {
    return 'channel';
  }
  if (input.length >= 1 && input.length <= 4) {
    return 'ident';
  }
  return 'invalid';
}

/**
 * The LS field (line 3 left): ident / frequency of an ILS, reference path identifier / channel of a GLS. What the
 * crew typed is in large font, what the FMS selected or derived is small.
 */
export function lsFieldCell(mmr: LsTuning): string {
  if (mmr.gls) {
    const ident = mmr.gls.rpi ?? '[\xa0\xa0]';
    const identFont = lsIdentEnteredByPilot(mmr) ? 'big' : 'small';
    const channelFont = lsFrequencyEnteredByPilot(mmr) ? 'big' : 'small';
    return `{cyan}{${identFont}}${ident.padStart(4, '\xa0')}{end}{${mmr.manual ? 'big' : 'small'}}/{end}{${channelFont}}${mmr.gls.channel.toFixed(0)}{end}{end}`;
  }

  let identText: string;
  let freqText: string;
  if (mmr.frequency !== null) {
    const ident = mmr.ident !== null ? mmr.ident : '[\xa0\xa0]';
    identText = `{${mmr.manual ? 'big' : 'small'}}${ident.padStart(4, '\xa0')}{end}`;
    freqText = `{${mmr.manual && mmr.ident === null ? 'big' : 'small'}}${mmr.frequency.toFixed(2)}{end}`;
  } else {
    identText = '[\xa0\xa0]';
    freqText = '[\xa0\xa0\xa0\xa0]';
  }
  return `{cyan}${identText}{${mmr.manual ? 'big' : 'small'}}/{end}${freqText}{end}`;
}

/**
 * Whether the slope is shown beside the course: for a landing system the crew tuned, and after take-off for the
 * precision approach of the flight plan.
 * @param takeoffOrEarlier the flight phase is take-off or earlier
 * @param precisionApproachSelected the approach of the flight plan is an ILS or a GLS
 */
export function showsLsSlope(
  mmr: Pick<LsTuning, 'manual'>,
  takeoffOrEarlier: boolean,
  precisionApproachSelected: boolean,
) {
  return mmr.manual || (!takeoffOrEarlier && precisionApproachSelected);
}

/** The CRS field (line 4 left) with the slope when shown */
export function lsCourseCell(mmr: LsTuning, showSlope: boolean): string {
  const slope =
    mmr.slope !== null ? `\xa0\xa0{small}{green}${mmr.slope.toFixed(1)}{end}{end}` : '{white}\xa0\xa0\xa0-.-{end}';
  if (mmr.course !== null) {
    return `{${mmr.courseManual ? 'big' : 'small'}}{cyan}${mmr.backcourse ? 'B' : 'F'}${mmr.course.toFixed(0).padStart(3, '0')}{end}{end}${showSlope ? slope : ''}`;
  }
  if (mmr.gls) {
    // No table row for the channel: the receiver has no course, and the crew cannot enter one
    return `{white}----{end}${slope}`;
  }
  if (mmr.frequency !== null) {
    return `{amber}____{end}${slope}`;
  }
  return '{cyan}[\xa0\xa0]{end}';
}

/** The label of the CRS field: SLOPE joins it when the slope is shown for a tuned landing system */
export function lsCourseTitle(mmr: LsTuning, showSlope: boolean): string {
  return showSlope && (mmr.frequency !== null || mmr.gls) ? 'CRS\xa0\xa0\xa0SLOPE' : 'CRS';
}
