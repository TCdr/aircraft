// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export enum TimeConstraintType {
  At,
  AtOrBefore,
  AtOrAfter,
}

/**
 * The time constraint (RTA) of a flight plan: only one per flight plan. It is kept with the ident and database id of
 * its waypoint, as the flight plan legs have no time constraint field.
 */
export interface TimeConstraint {
  ident: string;
  databaseId: string;
  type: TimeConstraintType;
  /** Required time of arrival, seconds of the UTC day */
  utcSeconds: number;
}

export const SECONDS_PER_DAY = 86_400;

/** Whether two RTAs are the same: same waypoint, type and time */
export function sameTimeConstraint(a: TimeConstraint, b: TimeConstraint): boolean {
  return a.databaseId === b.databaseId && a.type === b.type && a.utcSeconds === b.utcSeconds;
}

/** A time of day in seconds, brought into [0, 24 h) */
export function secondsOfDay(seconds: number): number {
  return ((seconds % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
}

/**
 * Time error = ETA - RTA (positive when late), across midnight: the shortest way round the clock, in [-12 h, +12 h).
 * @param etaUtcSeconds seconds of the UTC day (or beyond it)
 * @param rtaUtcSeconds seconds of the UTC day
 */
export function timeErrorSeconds(etaUtcSeconds: number, rtaUtcSeconds: number): number {
  return secondsOfDay(etaUtcSeconds - rtaUtcSeconds + SECONDS_PER_DAY / 2) - SECONDS_PER_DAY / 2;
}

/**
 * The part of the time error that the constraint does not accept: both ways for AT, only a late arrival for AT OR
 * BEFORE, only an early arrival for AT OR AFTER. Zero when the constraint accepts the ETA.
 */
export function constraintViolationSeconds(timeError: number, type: TimeConstraintType): number {
  switch (type) {
    case TimeConstraintType.AtOrBefore:
      return Math.max(0, timeError);
    case TimeConstraintType.AtOrAfter:
      return Math.min(0, timeError);
    default:
      return timeError;
  }
}

/**
 * The RTA entry of the MCDU RTA page: "HHMMSS" for AT, "+HHMMSS" for AT OR AFTER, "-HHMMSS" for AT OR BEFORE (the
 * minus may also be typed as the MCDU "−"). HHMM is accepted as HHMM00.
 * @returns the type and the time in seconds of the day, or null for a format error
 */
export function parseRtaEntry(entry: string): { type: TimeConstraintType; utcSeconds: number } | null {
  const match = /^([+\-−]?)(\d{2})(\d{2})(\d{2})?$/.exec(entry.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  const seconds = match[4] !== undefined ? Number(match[4]) : 0;
  if (hours > 23 || minutes > 59 || seconds > 59) {
    return null;
  }
  const type =
    match[1] === '+'
      ? TimeConstraintType.AtOrAfter
      : match[1] === ''
        ? TimeConstraintType.At
        : TimeConstraintType.AtOrBefore;
  return { type, utcSeconds: hours * 3600 + minutes * 60 + seconds };
}

/** "HHMMSS" of a time of day in seconds */
export function formatHhmmss(utcSeconds: number): string {
  const total = Math.round(secondsOfDay(utcSeconds)) % SECONDS_PER_DAY;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((v) => v.toFixed(0).padStart(2, '0')).join('');
}
