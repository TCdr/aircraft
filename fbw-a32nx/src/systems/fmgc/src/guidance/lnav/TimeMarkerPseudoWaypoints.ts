// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { VerticalCheckpoint } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { SECONDS_PER_DAY } from '@fmgc/guidance/vnav/rta/TimeConstraint';

/** A time marker the crew defined, with the time it is reached counted from the present of the vertical profile */
export interface TimeMarkerPrediction {
  /** The UTC of the marker, in seconds of the day */
  utcSeconds: number;
  secondsFromPresent: Seconds;
}

/** Provides the time markers defined by the crew to the pseudo waypoints. Only some aircraft have time markers. */
export interface TimeMarkerSource {
  predictions(): TimeMarkerPrediction[];
}

/** The part of the vertical profile needed to place a time marker on it */
export interface TimeMarkerProfile {
  checkpoints: readonly Pick<VerticalCheckpoint, 'secondsFromPresent'>[];
  interpolateDistanceAtTime(secondsFromPresent: Seconds): NauticalMiles;
}

/**
 * The seconds from a reference UTC to a UTC of the day, always ahead: a marker earlier in the day than the reference
 * is the one of the next day.
 */
export function secondsAheadOfUtc(utcSeconds: number, referenceUtcSeconds: number): Seconds {
  return (((utcSeconds - referenceUtcSeconds) % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
}

/** Design choice: the pseudo waypoint is named by its time, HHMM or HHMMSS when it has seconds, to tell up to 4 apart. */
export function timeMarkerIdent(utcSeconds: number): string {
  const hours = Math.floor(utcSeconds / 3600) % 24;
  const minutes = Math.floor((utcSeconds % 3600) / 60);
  const seconds = Math.floor(utcSeconds % 60);
  const twoDigits = (value: number) => value.toString().padStart(2, '0');

  return `(${twoDigits(hours)}${twoDigits(minutes)}${seconds > 0 ? twoDigits(seconds) : ''})`;
}

/**
 * Where the aircraft is predicted to be at the time of each marker.
 * @returns the markers inside the predicted flight, with their distance from the start of the profile
 */
export function timeMarkerDistancesFromStart(
  markers: readonly TimeMarkerPrediction[],
  profile: TimeMarkerProfile,
): { marker: TimeMarkerPrediction; distanceFromStart: NauticalMiles }[] {
  const firstSeconds = profile.checkpoints[0]?.secondsFromPresent;
  const lastSeconds = profile.checkpoints[profile.checkpoints.length - 1]?.secondsFromPresent;
  if (firstSeconds === undefined || lastSeconds === undefined) {
    return [];
  }

  return markers
    .filter((marker) => marker.secondsFromPresent > firstSeconds && marker.secondsFromPresent < lastSeconds)
    .map((marker) => ({ marker, distanceFromStart: profile.interpolateDistanceAtTime(marker.secondsFromPresent) }));
}
