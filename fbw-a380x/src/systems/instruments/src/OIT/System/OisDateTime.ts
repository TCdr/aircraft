// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The date and time texts of the OIS pages. They live apart from AnsuOps so that the FLT OPS boxes can use them
 * without loading the NSS AVNCS applications that AnsuOps holds.
 */

/** The month names of the OIS dates, e.g. 19-DEC */
export const OIS_MONTHS: readonly string[] = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

/**
 * @param t unix ms, or null
 * @returns the UTC date and time as DD-MMM HH:MM, e.g. 19-DEC 08:55, or a placeholder for null
 */
export function formatOisDateTime(t: number | null): string {
  if (t === null) {
    return '------ --:--';
  }

  const date = new Date(t);
  return `${String(date.getUTCDate()).padStart(2, '0')}-${OIS_MONTHS[date.getUTCMonth()]} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}
