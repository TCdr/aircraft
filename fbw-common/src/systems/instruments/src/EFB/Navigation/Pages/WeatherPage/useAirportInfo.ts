// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useEffect, useState } from 'react';
import { getAirport, Runway, runwaysOfAirport } from '../../../Performance/Data/Runways';
import { withTimeout } from '../../../Dashboard/logic/tripWeather';

export interface AirportInfo {
  /** Empty when the facility has no usable name */
  name: string;
  lat: number;
  lon: number;
  /** Runway ends with their true bearing */
  runways: Runway[];
}

/** The facility lookup answers with an event that may never come (airport not loadable) */
const LOOKUP_TIMEOUT_MS = 10_000;
/** A second lookup at the same time takes the first one's answer and is rejected: try again once a moment later */
const RETRY_DELAY_MS = 1_500;

/** An airport's facility data never changes during a flight */
const airportCache: Record<string, AirportInfo | null> = {};

/** Facility names that are translation ids (TT:...) are not names */
const usableName = (name: string | undefined): string => (name && name.indexOf('TT:') !== 0 ? name : '');

const lookUp = async (icao: string): Promise<AirportInfo | null> => {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
    const airport = await withTimeout(getAirport(icao), LOOKUP_TIMEOUT_MS).result;
    if (airport) {
      return {
        name: usableName(airport.name),
        lat: airport.lat,
        lon: airport.lon,
        runways: runwaysOfAirport(airport, icao),
      };
    }
  }
  return null;
};

/** Position, name and runways of an airport from the sim's facilities; null until known or when not found */
export const useAirportInfo = (icao: string | null): AirportInfo | null => {
  const [info, setInfo] = useState<AirportInfo | null>(() => (icao && airportCache[icao]) || null);

  useEffect(() => {
    if (!icao) {
      setInfo(null);
      return undefined;
    }
    if (icao in airportCache) {
      setInfo(airportCache[icao]);
      return undefined;
    }
    let cancelled = false;
    setInfo(null);
    lookUp(icao).then((found) => {
      if (found) {
        airportCache[icao] = found;
      }
      if (!cancelled) {
        setInfo(found);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [icao]);

  return info;
};
