// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The fields of the PROG REPORT page:
 * - [1L] OVHD: the last sequenced waypoint, never a pseudo waypoint or an F-PLN marker (T-P, PPOS, IN-BND, OUT-BND);
 *   [1R] UTC/TIME ALT: the time and altitude recorded at the sequencing.
 * - [2L]-[2R] TO, [3L]-[3R] NEXT: the waypoint with its predicted time and altitude, the same as on the F-PLN pages.
 * - [4L] [4R] SAT/T.WIND/FOB: the static air temperature, the wind and the FOB recorded at the sequencing.
 * - [5L] T/D/UTC/DIST: the time and distance to the next change of the cruise profile (T/D, S/C, S/D), in the cruise
 *   phase only.
 * - Line 6 DEST/UTC/DIST/EFOB: the same as on the F-PLN pages.
 * - No data can be entered or modified on the REPORT page.
 */

/** The F-PLN markers the OVHD field never shows */
const F_PLN_MARKERS = ['T-P', 'PPOS', 'IN-BND', 'OUT-BND'];

/**
 * Whether a sequenced leg can be shown in the OVHD field: not an F-PLN marker, and not a pseudo waypoint or a leg
 * without a fix (the idents in parentheses: (T/D), (DECEL), (1500), (INTCPT), (VECT)...).
 */
export function isOverheadReportable(ident: string): boolean {
  return ident.length > 0 && !ident.startsWith('(') && F_PLN_MARKERS.indexOf(ident) === -1;
}

/** What the FMS records when it sequences a waypoint */
export interface OverheadRecord {
  ident: string;
  /** The UTC of the sequencing, ms (the sim time) */
  utcMs: number;
  /** The baro corrected altitude, ft, null when not available */
  altitude: number | null;
  /** Whether the aircraft was descending (the altitude is then shown with the transition level) */
  descending: boolean;
  /** The static air temperature, degrees C, null when not available */
  staticAirTemperature: number | null;
  /** The wind direction, degrees, and speed, kt, null when not available */
  windDirection: number | null;
  windSpeed: number | null;
  /** The FOB, in the user's unit (thousands of kg or lb), null when not available */
  fob: number | null;
}

/** The sequenced leg the recorder follows: the FROM leg of the active flight plan */
export interface SequencedLeg {
  /** The leg identity, kept by the flight plan copies */
  uuid: string;
  ident: string;
}

/**
 * Records the OVHD waypoint and its data when the FROM leg of the active flight plan changes in flight (a waypoint
 * sequencing). A new FROM leg that cannot be shown (T-P after a DIR TO...) keeps the last record.
 */
export class OverheadWaypointRecorder {
  private lastFromLegUuid: string | null = null;

  private lastRecord: OverheadRecord | null = null;

  /** The last record, null before the first sequencing in flight */
  public get record(): OverheadRecord | null {
    return this.lastRecord;
  }

  /**
   * @param fromLeg the FROM leg of the active flight plan, null when there is none
   * @param flying whether the aircraft is in flight (no sequencing on the ground: entering the flight plan changes the
   *   FROM leg too)
   * @param readData reads the data recorded with the waypoint
   */
  public update(fromLeg: SequencedLeg | null, flying: boolean, readData: () => Omit<OverheadRecord, 'ident'>): void {
    const uuid = fromLeg !== null ? fromLeg.uuid : null;
    if (uuid === this.lastFromLegUuid) {
      return;
    }
    this.lastFromLegUuid = uuid;
    if (flying && fromLeg !== null && isOverheadReportable(fromLeg.ident)) {
      const data = readData();
      this.lastRecord = {
        ident: fromLeg.ident,
        utcMs: data.utcMs,
        altitude: data.altitude,
        descending: data.descending,
        staticAirTemperature: data.staticAirTemperature,
        windDirection: data.windDirection,
        windSpeed: data.windSpeed,
        fob: data.fob,
      };
    }
  }

  /** Forgets the record (FMS reset at the end of a flight) */
  public reset(): void {
    this.lastFromLegUuid = null;
    this.lastRecord = null;
  }
}

/**
 * An altitude as on the F-PLN pages: a flight level above the transition altitude in climb and cruise, at or above the
 * transition level in descent, else the altitude rounded to 10 ft.
 * @param altitude ft
 * @param descending whether the altitude is in the descent
 * @param transitionAltitude ft, null when not known
 * @param transitionLevel FL, null when not known
 */
export function formatReportAltitude(
  altitude: number,
  descending: boolean,
  transitionAltitude: number | null,
  transitionLevel: number | null,
): string {
  const isFlightLevel = descending
    ? transitionLevel !== null && altitude >= transitionLevel * 100
    : transitionAltitude !== null && altitude > transitionAltitude;
  if (isFlightLevel) {
    return `FL${(altitude / 100).toFixed(0).padStart(3, '0')}`;
  }
  return (Math.round(altitude / 10) * 10).toFixed(0);
}

/** The static air temperature cell: signed whole degrees */
export function formatReportTemperature(staticAirTemperature: number | null): string {
  if (staticAirTemperature === null || !Number.isFinite(staticAirTemperature)) {
    return '---°';
  }
  const rounded = Math.round(staticAirTemperature);
  return `${rounded < 0 ? '-' : '+'}${Math.abs(rounded).toFixed(0)}°`;
}

/** The wind cell: direction and speed, DDD°/SSS */
export function formatReportWind(windDirection: number | null, windSpeed: number | null): string {
  if (windDirection === null || windSpeed === null || !Number.isFinite(windDirection) || !Number.isFinite(windSpeed)) {
    return '---°/---';
  }
  const direction = Math.round(windDirection) % 360 || 360;
  return `${direction.toFixed(0).padStart(3, '0')}°/${Math.round(windSpeed).toFixed(0).padStart(3, '0')}`;
}

/** The pseudo waypoints of the cruise profile changes, with their names on the page */
const CRUISE_PROFILE_CHANGES: Record<string, string> = { '(T/D)': 'T/D', '(S/C)': 'S/C', '(S/D)': 'S/D' };

export interface ReportPseudoWaypoint {
  ident: string;
  flightPlanInfo?: { secondsFromPresent: number; distanceFromAircraft: number } | null;
}

export interface CruiseProfileChange {
  name: string;
  secondsFromPresent: number;
  distance: number;
}

/**
 * The next change of the cruise profile ahead of the aircraft (T/D, S/C or S/D), only in the cruise phase.
 * @param pseudoWaypoints the pseudo waypoints of the active flight plan
 * @param inCruise whether the cruise phase is active
 * @returns the nearest change ahead, null when none or outside the cruise phase
 */
export function nextCruiseProfileChange(
  pseudoWaypoints: readonly ReportPseudoWaypoint[],
  inCruise: boolean,
): CruiseProfileChange | null {
  if (!inCruise) {
    return null;
  }
  let next: CruiseProfileChange | null = null;
  for (const pwp of pseudoWaypoints) {
    const name = CRUISE_PROFILE_CHANGES[pwp.ident];
    const info = pwp.flightPlanInfo;
    if (
      name === undefined ||
      !info ||
      !Number.isFinite(info.secondsFromPresent) ||
      !Number.isFinite(info.distanceFromAircraft) ||
      info.distanceFromAircraft < 0
    ) {
      continue;
    }
    if (next === null || info.distanceFromAircraft < next.distance) {
      next = { name, secondsFromPresent: info.secondsFromPresent, distance: info.distanceFromAircraft };
    }
  }
  return next;
}
