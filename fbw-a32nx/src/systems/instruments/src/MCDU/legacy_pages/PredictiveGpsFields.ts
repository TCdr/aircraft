// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The fields of the PREDICTIVE GPS page (A320 FCOM DSC-22_20-50-10-28 PREDICTIVE GPS PAGE, a320_fcom.txt l.21346-21404):
 * - [1L] DEST [1R] ETA (l.21356-21364): the destination of the active flight plan; the ETA "is defaulted to the estimated
 *   arrival time, as computed by the FMS (small blue font). The pilot may enter a value in this field (large blue font).
 *   Amber boxes are displayed when no prediction exists, or when the crew entry has been cleared."
 * - Line 2 and line 4 PRIMARY Y/N (l.21378-21386): the predicted GPS PRIMARY at the ETA -15, -10, -5, 0, +5, +10, +15 min,
 *   Y available, N unavailable; "These fields are blank, when the destination [1L], or time [1R] field is not defined."
 * - [3L] WPT [3R] ETA (l.21388-21396): a crew waypoint (blue brackets without one), then amber boxes for its reference
 *   time, then the same Y/N line as for the destination.
 * - Line 5/6 DESELECTED SATELLITES (l.21398-21404): up to four satellite numbers in large blue font; "The deselection
 *   is cancelled when the entry is cleared (blue brackets appears), or when the field is overwritten by a different
 *   satellite number."
 * - Time format (MCDU data format list, UTC CSTR l.23888-23893): HHMM, HH 0-23, MM 0-59, leading zeros may be omitted.
 *
 * The sim has no GPS constellation (no almanac to predict the satellite geometry at a future time): the prediction is the
 * GPS receiver state now, Y at every time when a GPS receiver gives a position, N when none does. The deselected
 * satellites are kept and shown, they cannot change that prediction.
 */

/** Up to four satellites can be deselected (l.21398) */
export const MAX_DESELECTED_SATELLITES = 4;

/** GPS satellite numbers (PRN) */
const MIN_SATELLITE_NUMBER = 1;
const MAX_SATELLITE_NUMBER = 32;

/** An entry error: FORMAT ERROR or ENTRY OUT OF RANGE */
export type PredictiveGpsEntryError = 'format' | 'range';

/**
 * Parses an ETA entry, HHMM with the leading zeros omitted allowed.
 * @returns the time of day in seconds, or the entry error
 */
export function parsePredictiveEta(entry: string): number | PredictiveGpsEntryError {
  if (!/^\d{1,4}$/.test(entry)) {
    return 'format';
  }
  const padded = entry.padStart(4, '0');
  const hours = parseInt(padded.substring(0, 2));
  const minutes = parseInt(padded.substring(2, 4));
  if (hours > 23 || minutes > 59) {
    return 'range';
  }
  return hours * 3600 + minutes * 60;
}

/**
 * Parses a satellite number entry.
 * @returns the satellite number, or the entry error
 */
export function parseSatelliteNumber(entry: string): number | PredictiveGpsEntryError {
  if (!/^\d{1,2}$/.test(entry)) {
    return 'format';
  }
  const satellite = parseInt(entry);
  if (satellite < MIN_SATELLITE_NUMBER || satellite > MAX_SATELLITE_NUMBER) {
    return 'range';
  }
  return satellite;
}

/**
 * The deselected satellites after an entry: a new number is added, the oldest one overwritten when four are already
 * deselected; a number already deselected changes nothing.
 */
export function deselectSatellite(deselected: readonly number[], satellite: number): number[] {
  if (deselected.indexOf(satellite) !== -1) {
    return deselected.slice();
  }
  const kept = deselected.length >= MAX_DESELECTED_SATELLITES ? deselected.slice(1) : deselected.slice();
  kept.push(satellite);
  return kept;
}

/** The ETA cell of the destination: the crew entry (large), else the FMS prediction (small), else amber boxes */
export function predictiveDestinationEtaCell(
  pilotEtaSeconds: number | null,
  pilotEtaCleared: boolean,
  predictedEtaSeconds: number | null,
): { text: string; etaSeconds: number | null } {
  if (pilotEtaSeconds !== null) {
    return { text: `{cyan}${formatTimeOfDay(pilotEtaSeconds)}{end}`, etaSeconds: pilotEtaSeconds };
  }
  if (!pilotEtaCleared && predictedEtaSeconds !== null && Number.isFinite(predictedEtaSeconds)) {
    return { text: `{cyan}{small}${formatTimeOfDay(predictedEtaSeconds)}{end}{end}`, etaSeconds: predictedEtaSeconds };
  }
  return { text: '{amber}____{end}', etaSeconds: null };
}

/** HHMM of a time of day in seconds (wraps past midnight) */
export function formatTimeOfDay(seconds: number): string {
  const daySeconds = ((Math.floor(seconds) % 86400) + 86400) % 86400;
  const hours = Math.floor(daySeconds / 3600);
  const minutes = Math.floor((daySeconds % 3600) / 60);
  return `${hours.toFixed(0).padStart(2, '0')}${minutes.toFixed(0).padStart(2, '0')}`;
}

/**
 * The PRIMARY Y/N line under the -15 -10 -5 ETA +5 +10 +15 header.
 * @param defined whether the place and its time are both defined (blank line otherwise)
 * @param gpsAvailable whether a GPS receiver gives a position (the prediction, see the file comment)
 */
export function predictivePrimaryLine(defined: boolean, gpsAvailable: boolean): string {
  if (!defined) {
    return '';
  }
  const status = gpsAvailable ? 'Y' : 'N';
  // the letters sit under the -15, -10, -5, ETA, +5, +10, +15 columns of the header line
  const gaps = ['\xa0\xa0\xa0\xa0', '\xa0\xa0', '\xa0\xa0\xa0', '\xa0\xa0', '\xa0\xa0', '\xa0\xa0\xa0', '\xa0\xa0'];
  return `{green}{small}${gaps.map((gap) => gap + status).join('')}{end}{end}`;
}

/** The DESELECTED SATELLITES cell: the numbers in large blue font, blue brackets while fewer than four */
export function deselectedSatellitesCell(deselected: readonly number[]): string {
  const numbers = deselected.map((satellite) => satellite.toFixed(0).padStart(2, '0')).join('\xa0');
  const brackets = deselected.length < MAX_DESELECTED_SATELLITES ? '[\xa0]' : '';
  return `{cyan}${numbers}${numbers.length > 0 && brackets.length > 0 ? '\xa0' : ''}${brackets}{end}`;
}
