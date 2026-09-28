// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  AmdbProjection,
  BtvAmdbFeature,
  BtvExit,
  buildTaxiNetwork,
  FeatureType,
  FeatureTypeString,
  getAmdbData,
  runwayExitsFromAmdb,
  TaxiAmdbFeature,
  taxiLinesFromAmdb,
  TaxiMapShapes,
  taxiMapShapesFromAmdb,
  TaxiNetwork,
  TaxiPoint,
  TaxiRunway,
  TaxiRunwayAxis,
  taxiRunwayAxesFromAmdb,
  taxiRunwayEntries,
  TaxiRunwayEntry,
  taxiHoldingLinesFromAmdb,
  taxiRunwaysFromAmdb,
  TaxiStand,
  taxiStandsFromAmdb,
} from '@flybywiresim/fbw-sdk';

/** An airport of the Navigraph airport database, ready for taxi routes */
export interface TaxiAirport {
  icao: string;
  /** The aerodrome reference point: the origin of the airport map */
  arp: { lat: number; long: number };
  network: TaxiNetwork;
  stands: TaxiStand[];
  runways: TaxiRunway[];
  shapes: TaxiMapShapes;
  /** The runway designators (thresholds), e.g. 09R, and the exits of each */
  exits: Map<string, BtvExit[]>;
  /** The runway directions, and the entries of each (the first one is the full length entry) */
  axes: TaxiRunwayAxis[];
  entries: Map<string, TaxiRunwayEntry[]>;
  /** The runway holding position lines */
  holdingLines: TaxiPoint[][];
}

export type TaxiAirportState =
  | { state: 'loading' }
  | { state: 'loaded'; airport: TaxiAirport }
  /** Not in the airport database */
  | { state: 'not-found' }
  /** No airport database: no Navigraph account connected, or no subscription */
  | { state: 'unavailable' };

const LAYERS = [
  FeatureTypeString.TaxiwayGuidanceLine,
  FeatureTypeString.RunwayExitLine,
  FeatureTypeString.StandGuidanceLine,
  FeatureTypeString.ParkingStandLocation,
  FeatureTypeString.RunwayElement,
  FeatureTypeString.TaxiwayElement,
  FeatureTypeString.ApronElement,
  FeatureTypeString.RunwayThreshold,
  FeatureTypeString.PaintedCenterline,
  FeatureTypeString.TaxiwayHoldingPosition,
];

/** The last airports, most recent last */
const cache: TaxiAirport[] = [];
const CACHE_SIZE = 3;

function padDesignator(designator: string): string {
  return designator.replace(/[^0-9]/g, '').length < 2 ? `0${designator}` : designator;
}

/** Loads an airport from the Navigraph airport database (the one of the OANS) */
export async function loadTaxiAirport(icao: string): Promise<TaxiAirportState> {
  const code = icao.toUpperCase();
  const cached = cache.find((it) => it.icao === code);
  if (cached) {
    return { state: 'loaded', airport: cached };
  }
  try {
    const [data, arpData] = await Promise.all([
      getAmdbData(code, LAYERS, undefined, AmdbProjection.ArpAzeq),
      getAmdbData(code, [FeatureTypeString.AerodromeReferencePoint], undefined, AmdbProjection.Epsg4326),
    ]);
    const arp = arpData?.aerodromereferencepoint?.features[0]?.geometry;
    if (!arp || arp.type !== 'Point') {
      return { state: 'not-found' };
    }
    const features: TaxiAmdbFeature[] = [];
    Object.values(data ?? {}).forEach((layer) =>
      layer?.features?.forEach((f) => features.push(f as unknown as TaxiAmdbFeature)),
    );
    const network = buildTaxiNetwork(taxiLinesFromAmdb(features));
    const exits = new Map<string, BtvExit[]>();
    const thresholds: string[] = [];
    for (const f of features) {
      if (f.properties.feattype === FeatureType.RunwayThreshold && f.properties.idthr) {
        thresholds.push(padDesignator(f.properties.idthr));
      }
    }
    for (const runway of [...new Set(thresholds)].sort()) {
      const runwayExits = runwayExitsFromAmdb(features as unknown as BtvAmdbFeature[], runway);
      if (runwayExits && runwayExits.length > 0) {
        exits.set(runway, runwayExits);
      }
    }
    const axes = taxiRunwayAxesFromAmdb(features);
    const entries = new Map<string, TaxiRunwayEntry[]>();
    for (const axis of axes) {
      const runwayEntries = taxiRunwayEntries(network, axis);
      if (runwayEntries.length > 0) {
        entries.set(axis.ident, runwayEntries);
      }
    }
    const airport: TaxiAirport = {
      icao: code,
      arp: { lat: arp.coordinates[1], long: arp.coordinates[0] },
      network,
      stands: taxiStandsFromAmdb(features),
      runways: taxiRunwaysFromAmdb(features),
      shapes: taxiMapShapesFromAmdb(features),
      exits,
      axes,
      entries,
      holdingLines: taxiHoldingLinesFromAmdb(features),
    };
    cache.push(airport);
    if (cache.length > CACHE_SIZE) {
      cache.shift();
    }
    return { state: 'loaded', airport };
  } catch (e) {
    if ((e as { response?: { status?: number } })?.response?.status === 404) {
      return { state: 'not-found' };
    }
    console.warn('[flypad] Taxi route airport:', e);
    return { state: 'unavailable' };
  }
}
