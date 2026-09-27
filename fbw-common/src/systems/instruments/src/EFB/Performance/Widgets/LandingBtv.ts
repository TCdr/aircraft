// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  AmdbProjection,
  BtvAmdbFeature,
  BtvExit,
  FeatureTypeString,
  getAmdbData,
  runwayExitsFromAmdb,
} from '@flybywiresim/fbw-sdk';

/** The exits of a runway for BTV, or why they are not known */
export type LandingRunwayExits =
  | { state: 'loading' }
  | { state: 'loaded'; exits: BtvExit[] }
  /** The airport or the runway is not in the airport database */
  | { state: 'no-runway' }
  /** No airport database: no Navigraph account connected, or no subscription */
  | { state: 'unavailable' };

const cache = new Map<string, BtvExit[] | null>();

/**
 * The exits of a runway from the Navigraph airport database, the one of the OANS, as the OANS finds them for BTV.
 * @param runway the runway designator, e.g. 27L
 */
export async function loadLandingRunwayExits(icao: string, runway: string): Promise<LandingRunwayExits> {
  const key = `${icao.toUpperCase()}${runway}`;
  if (!cache.has(key)) {
    try {
      const data = await getAmdbData(
        icao.toUpperCase(),
        [FeatureTypeString.RunwayThreshold, FeatureTypeString.PaintedCenterline, FeatureTypeString.RunwayExitLine],
        undefined,
        AmdbProjection.ArpAzeq,
      );
      const features: BtvAmdbFeature[] = [];
      Object.values(data ?? {}).forEach((layer) =>
        layer?.features?.forEach((f) => features.push(f as unknown as BtvAmdbFeature)),
      );
      cache.set(key, runwayExitsFromAmdb(features, runway));
    } catch (e) {
      console.warn('[flypad] Landing BTV exits:', e);
      return { state: 'unavailable' };
    }
  }
  const exits = cache.get(key);
  if (exits === undefined) {
    return { state: 'unavailable' };
  }
  return exits === null ? { state: 'no-runway' } : { state: 'loaded', exits };
}
