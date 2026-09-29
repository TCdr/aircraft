// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { formatWaypoint, normalizeBearing, sndBearing, sndDistance, SndPoint } from './SndGeo';
import { SndMenuView } from './SndMenu';
import { SndGuidance, SndNavigator } from './SndNavigator';

/** TO WPT and the course of the leg, in the heading reference (magnetic, or true) */
export interface SndGuidanceView {
  /** e.g. 352 */
  bearing: string;
  /** The unit of the bearing: ° magnetic, T true */
  bearingUnit: string;
  /** e.g. 283 (above 20 NM), 12.4 (below) */
  distance: string;
  /** Desired track in the heading reference, degrees */
  desiredTrack: number;
  /** NM, positive right of the leg */
  crossTrack: number;
}

/** The FIX: its bearing (in the heading reference) and distance to go */
export interface SndFixView {
  bearing: number;
  /** e.g. 328 */
  distance: string;
}

/** A line of the waypoint list */
export interface SndListRow {
  label: string;
  text: string;
  /** The TO waypoint is white, the others green, the FIX magenta */
  colour: 'white' | 'green' | 'magenta';
}

/** The lower part of the SND: the waypoint list, or the menu */
export type SndLowerView =
  | { kind: 'menu'; menu: SndMenuView }
  | {
      kind: 'list';
      rows: SndListRow[];
      /** The true bearing and distance between the two waypoints joined by the bracket, from the row of the first one */
      bracket: { row: number; bearing: string; distance: string } | null;
    };

export const formatSndDistance = (nm: number) => (nm >= 20 ? Math.round(nm).toString() : nm.toFixed(1));

/**
 * TO WPT bearing / distance (magnetic or true as the heading, FCOM DSC-34-10-20-30) and the leg course
 * @param magneticVariation degrees east
 */
export function sndGuidanceView(
  guidance: SndGuidance | null,
  trueReference: boolean,
  magneticVariation: number,
): SndGuidanceView | null {
  if (guidance === null) {
    return null;
  }
  const reference = (trueBearing: number) =>
    trueReference ? trueBearing : normalizeBearing(trueBearing - magneticVariation);
  const bearing = Math.round(reference(guidance.bearingToTo)) % 360;
  return {
    bearing: (bearing === 0 ? 360 : bearing).toString().padStart(3, '0'),
    bearingUnit: trueReference ? 'T' : '°',
    distance: formatSndDistance(guidance.distanceToTo),
    desiredTrack: reference(guidance.desiredTrack),
    crossTrack: guidance.crossTrack,
  };
}

/**
 * The waypoint list: FROM, TO and NEXT when the navigation is activated, otherwise the first waypoints of the list. The
 * bearing between the TO and the NEXT waypoints is always true.
 */
export function sndFixView(
  fix: SndPoint | null,
  aircraft: SndPoint | null,
  trueReference: boolean,
  magneticVariation: number,
): SndFixView | null {
  if (fix === null || aircraft === null) {
    return null;
  }
  const bearing = sndBearing(aircraft, fix);
  return {
    bearing: trueReference ? bearing : normalizeBearing(bearing - magneticVariation),
    distance: formatSndDistance(sndDistance(aircraft, fix)),
  };
}

export function sndListView(navigator: SndNavigator, guidance: SndGuidance | null): SndLowerView {
  // The FIX, when defined, is always at the bottom of the list
  const fixRow: SndListRow[] = navigator.fix
    ? [{ label: 'FIX', text: formatWaypoint(navigator.fix), colour: 'magenta' }]
    : [];
  const bracket = (row: number, bearing: number | null, distance: number | null) =>
    bearing !== null && distance !== null
      ? { row, bearing: Math.round(bearing).toString().padStart(3, '0'), distance: formatSndDistance(distance) }
      : null;
  if (guidance !== null) {
    const rows: SndListRow[] = [
      { label: 'FROM', text: formatWaypoint(guidance.from), colour: 'green' },
      { label: 'TO', text: formatWaypoint(guidance.to), colour: 'white' },
    ];
    if (guidance.next) {
      rows.push({ label: 'NEXT', text: formatWaypoint(guidance.next), colour: 'green' });
    }
    return {
      kind: 'list',
      rows: [...rows, ...fixRow],
      bracket: bracket(1, guidance.nextBearing, guidance.nextDistance),
    };
  }
  const list = navigator.waypoints;
  const rows: SndListRow[] = list.slice(0, 3).map((p) => ({ label: '', text: formatWaypoint(p), colour: 'green' }));
  return {
    kind: 'list',
    rows: [...rows, ...fixRow],
    bracket: list.length >= 2 ? bracket(0, sndBearing(list[0], list[1]), sndDistance(list[0], list[1])) : null,
  };
}
