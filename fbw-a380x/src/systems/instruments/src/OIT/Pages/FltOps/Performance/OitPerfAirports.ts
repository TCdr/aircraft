// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, FacilityLoader, FacilityRepository, FacilityType, ICAO } from '@microsoft/msfs-sdk';
import { MagVar } from '@flybywiresim/fbw-sdk';
import { PerformanceRunway, performanceRunways } from '../../../System/Performance/PerformanceRunways';

/** An airport of the airport panel of T.O PERF and LDG PERF */
export interface PerformanceAirport {
  readonly icao: string;
  readonly name: string;
  readonly runways: readonly PerformanceRunway[];
}

let loader: FacilityLoader | null = null;

const cache = new Map<string, PerformanceAirport | null>();

/**
 * Loads an airport and its runways from the sim's airport data (the laptop performance database has no airport data
 * of its own here).
 * @param bus the event bus
 * @param icao the airport ICAO code
 * @returns the airport, or null when the sim does not know it
 */
export async function loadPerformanceAirport(bus: EventBus, icao: string): Promise<PerformanceAirport | null> {
  const cached = cache.get(icao);
  if (cached !== undefined) {
    return cached;
  }
  if (loader === null) {
    loader = new FacilityLoader(FacilityRepository.getRepository(bus));
  }
  let airport: PerformanceAirport | null = null;
  try {
    const facility = await loader.getFacility(FacilityType.Airport, ICAO.value('A', '', '', icao));
    const name = Utils.Translate(facility.name) ?? facility.name;
    airport = {
      icao,
      name: name.toUpperCase(),
      runways: performanceRunways(facility.runways, MagVar.get(facility.lat, facility.lon) ?? 0),
    };
  } catch (e) {
    console.warn('[OIT] Performance airport:', icao, e);
  }
  cache.set(icao, airport);
  return airport;
}
