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

/** The month names of the FLT FOLDER dates, e.g. 23-Sep-08 */
const OIS_MONTHS_MIXED_CASE: readonly string[] = OIS_MONTHS.map(
  (month) => month.charAt(0) + month.substring(1).toLowerCase(),
);

/**
 * @param dateMs unix ms
 * @returns the UTC date as DD-Mmm-YY, e.g. 23-Sep-08: the FLT FOLDER writes its dates this way, the boxes in capitals
 */
export function oisDateMixedCase(dateMs: number): string {
  const date = new Date(dateMs);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = String(date.getUTCFullYear() % 100).padStart(2, '0');
  return `${day}-${OIS_MONTHS_MIXED_CASE[date.getUTCMonth()]}-${year}`;
}

/**
 * @param dateMs unix ms
 * @returns the UTC time as HH:MM
 */
export function oisTime(dateMs: number): string {
  const date = new Date(dateMs);
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}
