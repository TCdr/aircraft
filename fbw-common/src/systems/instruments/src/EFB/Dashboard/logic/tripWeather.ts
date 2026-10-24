// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { StationWx } from './advice';

export type TripRole = 'dep' | 'dest' | 'altn';

export interface TripAirport {
  role: TripRole;
  icao: string;
  /** Runway of the OFP, e.g. 27R. Null when the OFP names none or the airport is typed by the user */
  runway: string | null;
}

export interface OfpAirports {
  origin: string;
  originRunway: string;
  destination: string;
  destinationRunway: string;
  alternate?: string;
}

const ICAO_PATTERN = /^[A-Z0-9]{4}$/;

const cleanIcao = (value: string | undefined | null): string | null => {
  const icao = (value ?? '').trim().toUpperCase();
  return ICAO_PATTERN.test(icao) ? icao : null;
};

const runwayOrNull = (value: string): string | null => (value.trim() === '' ? null : value.trim().toUpperCase());

/**
 * The airports whose weather the dashboard shows: those of the OFP, or the airports typed in the weather widget when
 * there is no OFP. The user typed airports have no runway, so they give no crosswind.
 */
export const selectTripAirports = (input: {
  ofp: OfpAirports | null;
  userDeparture?: string;
  userDestination?: string;
}): TripAirport[] => {
  const { ofp } = input;
  const ofpOrigin = cleanIcao(ofp?.origin);
  const ofpDestination = cleanIcao(ofp?.destination);

  const airports: TripAirport[] = [];
  if (ofp && (ofpOrigin || ofpDestination)) {
    if (ofpOrigin) {
      airports.push({ role: 'dep', icao: ofpOrigin, runway: runwayOrNull(ofp.originRunway) });
    }
    if (ofpDestination) {
      airports.push({ role: 'dest', icao: ofpDestination, runway: runwayOrNull(ofp.destinationRunway) });
    }
    const alternate = cleanIcao(ofp.alternate);
    if (alternate) {
      airports.push({ role: 'altn', icao: alternate, runway: null });
    }
    return airports;
  }

  const departure = cleanIcao(input.userDeparture);
  const destination = cleanIcao(input.userDestination);
  if (departure) {
    airports.push({ role: 'dep', icao: departure, runway: null });
  }
  if (destination) {
    airports.push({ role: 'dest', icao: destination, runway: null });
  }
  return airports;
};

/**
 * The true heading of the runway of the OFP. METAR winds are true, so the magnetic bearing (and a heading derived from
 * the designator) must not be used here.
 */
export const trueRunwayHeading = (
  runway: string | null,
  runways: { ident: string; bearing: number }[] | null,
): number | null => {
  if (!runway || !runways) {
    return null;
  }
  const wanted = runway
    .trim()
    .toUpperCase()
    .replace(/^(\d)(?!\d)/, '0$1');
  const match = runways.find((candidate) => candidate.ident.toUpperCase() === wanted);
  return match ? match.bearing : null;
};

/** A report that could not be fetched, or came back empty, stays undefined so the advice rules skip it */
const reportOrUndefined = (report: string | null | undefined): string | undefined =>
  report && report.trim() !== '' ? report : undefined;

export const buildStationWx = (
  airport: TripAirport,
  metar: string | null | undefined,
  taf: string | null | undefined,
  runwayHeadingDeg: number | null,
): StationWx => ({
  icao: airport.icao,
  metar: reportOrUndefined(metar),
  taf: reportOrUndefined(taf),
  runwayHeadingDeg,
  isDeparture: airport.role === 'dep',
});

export interface TimedLookup<T> {
  /** Resolves with the value, or undefined when the lookup rejects, times out or is cancelled */
  result: Promise<T | undefined>;
  /** Stops the timer, so nothing runs after the component is gone */
  cancel: () => void;
}

/** Bounds a lookup that may never answer; the timer is always cleared once the lookup ends */
export const withTimeout = <T>(lookup: Promise<T>, timeoutMs: number): TimedLookup<T> => {
  let finish: (value: T | undefined) => void = () => undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = new Promise<T | undefined>((resolve) => {
    finish = (value) => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      resolve(value);
    };
    timer = setTimeout(() => finish(undefined), timeoutMs);
    lookup.then(finish, () => finish(undefined));
  });
  return { result, cancel: () => finish(undefined) };
};

/**
 * Milliseconds until the airports' cached reports are due again: 0 when one has none or is older than the refresh
 * period, so a return to the dashboard within the period reuses the cache instead of fetching again.
 * @param fetchedAtMs when each airport's reports were fetched, undefined for an airport never fetched
 */
export const msUntilRefresh = (fetchedAtMs: (number | undefined)[], nowMs: number, refreshMs: number): number => {
  let oldestMs = Infinity;
  for (const fetched of fetchedAtMs) {
    if (fetched === undefined) {
      return 0;
    }
    oldestMs = Math.min(oldestMs, fetched);
  }
  return Number.isFinite(oldestMs) ? Math.max(oldestMs + refreshMs - nowMs, 0) : 0;
};
