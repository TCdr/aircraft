// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  EventBus,
  FacilityFrequencyType,
  FacilityLoader,
  FacilityRepository,
  FacilityType,
  ICAO,
} from '@microsoft/msfs-sdk';

/** A radio frequency of an airport */
export interface TaxiFrequency {
  type: FacilityFrequencyType;
  /** The name of the station, as in the sim's airport data (e.g. TOKYO GROUND) */
  name: string;
  /** MHz */
  mhz: number;
}

/** The frequencies of an airport, or why they are not known */
export type TaxiFrequenciesState =
  | { state: 'loading' }
  | { state: 'loaded'; frequencies: TaxiFrequency[] }
  | { state: 'not-found' };

/** A group of the frequency box: the chart label of a frequency type and its frequencies */
export interface TaxiFrequencyGroup {
  label: string;
  frequencies: TaxiFrequency[];
}

/**
 * The labels of the frequency types as on the airport charts, in the chart order (ATIS, control, approach, departure,
 * tower, ground, delivery, then the advisory and weather stations)
 */
const CHART_LABELS: [FacilityFrequencyType, string][] = [
  [FacilityFrequencyType.ATIS, 'ATIS'],
  [FacilityFrequencyType.AWOS, 'AWOS'],
  [FacilityFrequencyType.ASOS, 'ASOS'],
  [FacilityFrequencyType.Center, 'CTL'],
  [FacilityFrequencyType.Approach, 'APP'],
  [FacilityFrequencyType.Departure, 'DEP'],
  [FacilityFrequencyType.Tower, 'TWR'],
  [FacilityFrequencyType.Ground, 'GND'],
  [FacilityFrequencyType.Clearance, 'DLV'],
  [FacilityFrequencyType.CPT, 'DLV'],
  [FacilityFrequencyType.GCO, 'DLV'],
  [FacilityFrequencyType.CTAF, 'CTAF'],
  [FacilityFrequencyType.Unicom, 'UNICOM'],
  [FacilityFrequencyType.Multicom, 'MULTICOM'],
  [FacilityFrequencyType.FSS, 'FSS'],
];

const cache = new Map<string, TaxiFrequency[] | null>();
let loader: FacilityLoader | null = null;

/**
 * The frequencies of an airport, from the sim's airport data (the Navigraph airport map has none); null when the sim
 * does not know the airport.
 * @param bus the flyPad event bus
 * @param icao the airport ICAO code
 * @returns the frequencies, without duplicates, in the order of the sim's data
 */
export async function loadTaxiFrequencies(bus: EventBus, icao: string): Promise<TaxiFrequency[] | null> {
  const cached = cache.get(icao);
  if (cached !== undefined) {
    return cached;
  }
  if (loader === null) {
    loader = new FacilityLoader(FacilityRepository.getRepository(bus));
  }
  let frequencies: TaxiFrequency[] | null = null;
  try {
    const airport = await loader.getFacility(FacilityType.Airport, ICAO.value('A', '', '', icao));
    frequencies = [];
    for (const f of airport.frequencies) {
      const mhz = Math.round(f.freqMHz * 1000) / 1000;
      if (mhz > 0 && !frequencies.some((known) => known.type === f.type && known.mhz === mhz)) {
        frequencies.push({ type: f.type, name: f.name, mhz });
      }
    }
  } catch (e) {
    console.warn('[flypad] Taxi frequencies:', icao, e);
  }
  cache.set(icao, frequencies);
  return frequencies;
}

/**
 * The frequencies grouped as on an airport chart: one group per chart label, in the chart order; the types a chart
 * does not list (e.g. the ILS) are left out
 * @param frequencies the frequencies of the airport
 * @returns the groups that have frequencies
 */
export function groupTaxiFrequencies(frequencies: TaxiFrequency[]): TaxiFrequencyGroup[] {
  const groups: TaxiFrequencyGroup[] = [];
  for (const [type, label] of CHART_LABELS) {
    const ofType = frequencies.filter((f) => f.type === type);
    if (ofType.length === 0) {
      continue;
    }
    const group = groups.find((g) => g.label === label);
    if (group) {
      group.frequencies.push(...ofType);
    } else {
      groups.push({ label, frequencies: ofType });
    }
  }
  return groups;
}
