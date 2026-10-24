// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Coordinates, distanceTo } from 'msfs-geo';
import { INavlogFix } from '../../../../../shared/src/Simbrief/simbriefInterface';

/** A pseudo waypoint of the SimBrief navlog (TOC or TOD) */
export interface NavlogPoint extends Coordinates {
  secondsAfterTakeoff: number;
}

export const navlogPoint = (navlog: INavlogFix[] | undefined, ident: 'TOC' | 'TOD'): NavlogPoint | null => {
  // SimBrief sends no fix list for a DCT route
  const fix = Array.isArray(navlog) ? navlog.find((f) => f.ident === ident) : undefined;
  if (!fix) {
    return null;
  }

  const point = {
    lat: parseFloat(fix.pos_lat),
    long: parseFloat(fix.pos_long),
    secondsAfterTakeoff: parseInt(fix.time_total, 10),
  };
  return Number.isFinite(point.lat) && Number.isFinite(point.long) && Number.isFinite(point.secondsAfterTakeoff)
    ? point
    : null;
};

/**
 * Where a point sits on the flight line, in percent. Measured like the plane's progress (remaining great-circle
 * distance to the arrival), so the plane reaches the mark when it is over the point.
 */
export const flightLineProgress = (departure: Coordinates, arrival: Coordinates, point: Coordinates): number => {
  const totalDistance = distanceTo(departure, arrival);
  if (!totalDistance) {
    return 0;
  }
  const progress = ((totalDistance - distanceTo(point, arrival)) / totalDistance) * 100;
  return Math.min(Math.max(progress, 0), 100);
};

const zuluTime = (unixSeconds: number): string => {
  const time = new Date(unixSeconds * 1000);
  return `${time.getUTCHours().toString().padStart(2, '0')}${time.getUTCMinutes().toString().padStart(2, '0')}Z`;
};

/** The planned time over a point: the navlog counts from takeoff, so off-block time plus taxi out first */
export const plannedTimeOver = (schedOut: string, taxiOutSeconds: number | string, point: NavlogPoint): string =>
  zuluTime(parseInt(schedOut, 10) + Number(taxiOutSeconds) + point.secondsAfterTakeoff);

/**
 * The time over a point: counted from the actual takeoff once it is known, so a late departure moves the marks with
 * the countdown; the planned time before takeoff.
 */
export const timeOverPoint = (
  schedOut: string,
  taxiOutSeconds: number | string,
  point: NavlogPoint,
  takeoffUnixSeconds: number | null,
): string =>
  takeoffUnixSeconds === null
    ? plannedTimeOver(schedOut, taxiOutSeconds, point)
    : zuluTime(takeoffUnixSeconds + point.secondsAfterTakeoff);
