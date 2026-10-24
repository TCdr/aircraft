// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useEffect, useMemo, useRef, useState } from 'react';
import { isSimbriefDataLoaded, useAppSelector } from '@flybywiresim/flypad';
import { getRunways } from '../Performance/Data/Runways';
import { fetchRawMetarBySource, fetchRawTafBySource } from '../Service/WeatherService';
import { StationWx } from './logic/advice';
import {
  buildStationWx,
  msUntilRefresh,
  selectTripAirports,
  TimedLookup,
  TripAirport,
  trueRunwayHeading,
  withTimeout,
} from './logic/tripWeather';

const REFRESH_MS = 10 * 60_000;
/** The facility lookup answers with an event that may never come (airport not loadable), and must not hold the weather back */
const RUNWAY_LOOKUP_TIMEOUT_MS = 10_000;

export interface TripWeather {
  dep?: StationWx;
  dest?: StationWx;
  altn?: StationWx;
  /** The trip's airports, also those whose reports are not in yet */
  airports: TripAirport[];
  loading: boolean;
}

export interface Reports {
  metar?: string;
  taf?: string;
}

/** Any failure (offline, unknown airport, empty answer) gives undefined: the card and the advice rules skip that report */
const fetchOrUndefined = async (fetchReport: (icao: string) => Promise<string>, icao: string) => {
  try {
    return await fetchReport(icao);
  } catch (_) {
    return undefined;
  }
};

const fetchReports = async (icao: string): Promise<Reports> => {
  const [metar, taf] = await Promise.all([
    fetchOrUndefined(fetchRawMetarBySource, icao),
    fetchOrUndefined(fetchRawTafBySource, icao),
  ]);
  return { metar, taf };
};

const airportKey = (airport: TripAirport) => `${airport.role}:${airport.icao}:${airport.runway ?? ''}`;

/**
 * Kept for the flyPad's life, so leaving the dashboard and coming back shows the last reports at once and only fetches
 * again when the refresh period is over. A runway's heading never changes and is looked up once.
 */
const reportsCache: Record<string, { reports: Reports; fetchedAtMs: number }> = {};
const headingsCache: Record<string, number | null> = {};

const cachedReportsOf = (keys: string[]): Record<string, Reports> => {
  const cached: Record<string, Reports> = {};
  keys.forEach((key) => {
    if (reportsCache[key]) {
      cached[key] = reportsCache[key].reports;
    }
  });
  return cached;
};

export const useTripWeather = (): TripWeather => {
  const ofpData = useAppSelector((state) => state.simbrief.data);
  const { userDepartureIcao, userDestinationIcao } = useAppSelector((state) => state.dashboard);
  const hasOfp = isSimbriefDataLoaded();

  const airports = useMemo(
    () =>
      selectTripAirports({
        ofp: hasOfp
          ? {
              origin: ofpData.departingAirport,
              originRunway: ofpData.departingRunway,
              destination: ofpData.arrivingAirport,
              destinationRunway: ofpData.arrivingRunway,
              alternate: ofpData.altIcao,
            }
          : null,
        userDeparture: userDepartureIcao,
        userDestination: userDestinationIcao,
      }),
    [
      hasOfp,
      ofpData.departingAirport,
      ofpData.departingRunway,
      ofpData.arrivingAirport,
      ofpData.arrivingRunway,
      ofpData.altIcao,
      userDepartureIcao,
      userDestinationIcao,
    ],
  );
  // A string key, so a refresh timer is not restarted by a new array with the same airports
  const airportsKey = airports.map(airportKey).join('|');

  const [reports, setReports] = useState<Record<string, Reports>>(() => cachedReportsOf(airports.map(airportKey)));
  const [headings, setHeadings] = useState<Record<string, number | null>>(() => ({ ...headingsCache }));
  const [loading, setLoading] = useState(false);

  const latestRefresh = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let runwayLookup: TimedLookup<unknown> | undefined;
    let timer: number | undefined;
    const keys = airports.map(airportKey);

    const refresh = () => {
      latestRefresh.current += 1;
      const thisRefresh = latestRefresh.current;
      const isCurrent = () => !cancelled && thisRefresh === latestRefresh.current;

      setLoading(true);
      Promise.all(airports.map((airport) => fetchReports(airport.icao))).then((fetched) => {
        if (!isCurrent()) {
          return;
        }
        const fetchedAtMs = Date.now();
        const next: Record<string, Reports> = {};
        keys.forEach((key, index) => {
          next[key] = fetched[index];
          reportsCache[key] = { reports: fetched[index], fetchedAtMs };
        });
        setReports(next);
        setLoading(false);
      });
    };

    // One lookup at a time: each uses a shared facility event, so a second request would take the first one's answer
    const lookUpRunways = async () => {
      for (const airport of airports) {
        if (!airport.runway || airportKey(airport) in headingsCache) {
          continue;
        }
        // The facility bearing is true, like the METAR wind; the magnetic bearing would skew the crosswind by the variation
        const lookup = withTimeout(getRunways(airport.icao), RUNWAY_LOOKUP_TIMEOUT_MS);
        runwayLookup = lookup;
        const runways = await lookup.result;
        if (cancelled) {
          return;
        }
        const heading = trueRunwayHeading(airport.runway, runways ?? null);
        // A lookup that timed out is tried again on the next visit
        if (runways) {
          headingsCache[airportKey(airport)] = heading;
        }
        setHeadings((previous) => ({ ...previous, [airportKey(airport)]: heading }));
      }
    };

    if (airports.length === 0) {
      setReports({});
      setLoading(false);
      return undefined;
    }
    setReports(cachedReportsOf(keys));
    const refreshAndRepeat = () => {
      refresh();
      timer = window.setTimeout(refreshAndRepeat, REFRESH_MS);
    };
    const dueInMs = msUntilRefresh(
      keys.map((key) => (reportsCache[key] ? reportsCache[key].fetchedAtMs : undefined)),
      Date.now(),
      REFRESH_MS,
    );
    if (dueInMs === 0) {
      refreshAndRepeat();
    } else {
      timer = window.setTimeout(refreshAndRepeat, dueInMs);
    }
    lookUpRunways();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (runwayLookup) {
        runwayLookup.cancel();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airportsKey]);

  const stationOf = (role: TripAirport['role']): StationWx | undefined => {
    const airport = airports.find((candidate) => candidate.role === role);
    const found = airport ? reports[airportKey(airport)] : undefined;
    if (!airport || !found) {
      return undefined;
    }
    return buildStationWx(airport, found.metar, found.taf, headings[airportKey(airport)] ?? null);
  };

  return { dep: stationOf('dep'), dest: stationOf('dest'), altn: stationOf('altn'), airports, loading };
};

/** Reports of airports outside the trip (typed on the weather page), kept like the trip's */
const stationCache: Record<string, { reports: Reports; fetchedAtMs: number }> = {};

/**
 * The METAR and TAF of one airport, refreshed like the trip's. Null fetches nothing: the caller takes the trip's
 * reports for a trip airport, so the same airport is not fetched twice.
 */
export const useStationReports = (icao: string | null): { reports?: Reports; loading: boolean } => {
  const [reports, setReports] = useState<Reports | undefined>(() =>
    icao && stationCache[icao] ? stationCache[icao].reports : undefined,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!icao) {
      setReports(undefined);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    let timer: number | undefined;
    const refreshAndRepeat = () => {
      setLoading(true);
      fetchReports(icao).then((fetched) => {
        if (cancelled) {
          return;
        }
        stationCache[icao] = { reports: fetched, fetchedAtMs: Date.now() };
        setReports(fetched);
        setLoading(false);
      });
      timer = window.setTimeout(refreshAndRepeat, REFRESH_MS);
    };
    const cached = stationCache[icao];
    setReports(cached ? cached.reports : undefined);
    const dueInMs = msUntilRefresh([cached ? cached.fetchedAtMs : undefined], Date.now(), REFRESH_MS);
    if (dueInMs === 0) {
      refreshAndRepeat();
    } else {
      timer = window.setTimeout(refreshAndRepeat, dueInMs);
    }
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [icao]);

  return { reports, loading };
};
