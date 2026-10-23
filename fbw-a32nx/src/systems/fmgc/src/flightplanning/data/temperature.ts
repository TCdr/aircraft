// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { PropagationType } from './wind';

/** A static air temperature the crew entered for an altitude at a cruise waypoint */
export interface TemperatureEntry {
  /** feet */
  altitude: number;
  /** °C */
  temperature: number;
}

export type PropagatedTemperatureEntry = TemperatureEntry & {
  /** Entry at the waypoint itself, or Forward when it comes from an earlier waypoint */
  type: PropagationType.Entry | PropagationType.Forward;
  sourceLegIndex: number;
};

/**
 * The temperature entry that applies at a leg: the entry of the leg itself, else the closest one up-path. Like the
 * cruise winds, an entry holds down-path until a waypoint has an entry of its own.
 * @param entryAt the entry of the leg at an index, undefined if the leg has none or is not a leg
 * @param atIndex the leg to evaluate
 * @returns the entry, or null if no waypoint up to this one has an entry
 */
export function propagateTemperatureEntry(
  entryAt: (legIndex: number) => TemperatureEntry | undefined,
  atIndex: number,
): PropagatedTemperatureEntry | null {
  for (let i = atIndex; i >= 0; i--) {
    const entry = entryAt(i);
    if (entry !== undefined) {
      return {
        altitude: entry.altitude,
        temperature: entry.temperature,
        type: i === atIndex ? PropagationType.Entry : PropagationType.Forward,
        sourceLegIndex: i,
      };
    }
  }
  return null;
}

export function cloneTemperatureEntry(entry: TemperatureEntry): TemperatureEntry {
  return { altitude: entry.altitude, temperature: entry.temperature };
}
