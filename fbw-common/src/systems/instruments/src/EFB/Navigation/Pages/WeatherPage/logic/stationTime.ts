// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MathUtils } from '../../../../../../../shared/src/MathUtils';
import { metarObservationTime } from '../../../../Dashboard/logic/metarTokens';
import { nearestInstantMs } from '../../../../Dashboard/logic/tafThunderstorm';
import { sunsetUtc } from '../../../../Dashboard/logic/sunset';
import { twoDigits } from '../../../../Dashboard/logic/dashboardFormat';

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
/** The reference point of a large airport is within about 2 nm of its gates */
const AT_AIRPORT_RADIUS_NM = 5;

/** The DDHHMMZ time of a METAR or TAF as an instant, in the month that puts it nearest to now */
export const reportTimeMs = (report: string, nowMs: number): number | null => {
  const time = metarObservationTime(report);
  return time ? nearestInstantMs(time.day, time.hour, time.minute, nowMs) : null;
};

/** Whole minutes since the report time, never negative */
export const reportAgeMinutes = (reportMs: number, nowMs: number): number =>
  Math.max(0, Math.floor((nowMs - reportMs) / MS_PER_MINUTE));

/**
 * The sim gives the local time of the aircraft's position only, so another airport's local time is unknown: it is
 * shown only for the airport the aircraft is at
 */
export const isAtAirport = (
  aircraftLat: number,
  aircraftLon: number,
  airportLat: number,
  airportLon: number,
): boolean =>
  MathUtils.computeGreatCircleDistance(aircraftLat, aircraftLon, airportLat, airportLon) <= AT_AIRPORT_RADIUS_NM;

/** The next sunset at a position after `nowMs`; null in polar day or night */
export const nextSunsetMs = (latDeg: number, lonDeg: number, nowMs: number): number | null => {
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    const sunset = sunsetUtc(latDeg, lonDeg, new Date(nowMs + dayOffset * MS_PER_DAY));
    if (sunset === null) {
      return null;
    }
    if (sunset.getTime() > nowMs) {
      return sunset.getTime();
    }
  }
  return null;
};

/** "1800Z" */
export const formatZulu = (ms: number): string => {
  const date = new Date(ms);
  return `${twoDigits(date.getUTCHours())}${twoDigits(date.getUTCMinutes())}Z`;
};

/** "03:00", the time of day at a local offset from UTC */
export const formatLocal = (ms: number, localOffsetSeconds: number): string => {
  const date = new Date(ms + localOffsetSeconds * 1000);
  return `${twoDigits(date.getUTCHours())}:${twoDigits(date.getUTCMinutes())}`;
};

/** "17m", "2h 05m" */
export const formatAge = (minutes: number): string =>
  minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${twoDigits(minutes % 60)}m`;

/** The start of each whole hour from `startMs` up to (not including) `endMs` */
export const hourStarts = (startMs: number, endMs: number): number[] => {
  const hours: number[] = [];
  for (let hour = Math.ceil(startMs / MS_PER_HOUR) * MS_PER_HOUR; hour < endMs; hour += MS_PER_HOUR) {
    hours.push(hour);
  }
  return hours;
};
