// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The station of a TAF: the first ICAO after the optional TAF, AMD and COR words */
const TAF_STATION = /^(?:TAF\s+)?(?:(?:AMD|COR)\s+)*([A-Z]{4})\b/;
/** The station of a METAR: the first ICAO after the optional METAR, SPECI and COR words */
const METAR_STATION = /^(?:(?:METAR|SPECI)\s+)?(?:COR\s+)?([A-Z]{4})\b/;

/**
 * The reports of one kind in the OFP's weather block, by the ICAO written in each. SimBrief gives one per airport of
 * the plan (departure, destination, alternates, takeoff and en-route alternates) under keys ending in the kind
 * (_taf, _metar), as a text or a list of texts: reading every such key keeps the airports a plan adds without naming
 * each key.
 */
const reportsByIcao = (weather: unknown, keySuffix: RegExp, station: RegExp): Record<string, string> => {
  const reports: Record<string, string> = {};
  if (!weather || typeof weather !== 'object') {
    return reports;
  }
  const block = weather as Record<string, unknown>;
  Object.keys(block)
    .filter((key) => keySuffix.test(key))
    .forEach((key) => {
      const value = block[key];
      const texts = Array.isArray(value) ? value : [value];
      texts.forEach((text) => {
        if (typeof text !== 'string') {
          return;
        }
        const report = text.trim().replace(/\s+/g, ' ').toUpperCase();
        const found = station.exec(report);
        if (found && !(found[1] in reports)) {
          reports[found[1]] = report;
        }
      });
    });
  return reports;
};

export const ofpTafsByIcao = (weather: unknown): Record<string, string> =>
  reportsByIcao(weather, /_taf$/i, TAF_STATION);

export const ofpMetarsByIcao = (weather: unknown): Record<string, string> =>
  reportsByIcao(weather, /_metar$/i, METAR_STATION);
